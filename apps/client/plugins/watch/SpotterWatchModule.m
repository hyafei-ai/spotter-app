// SpotterWatchModule.m — the iPhone side of the Apple Watch link, as a small React Native module.
// Added to the iOS app target by plugins/withSpotterWatch.js (only with SPOTTER_WATCH=1).
// NOT COMPILED OR RUN HERE: written against Apple's documented WatchConnectivity and HealthKit APIs and React
// Native's RCTEventEmitter; verify in Xcode.
//
// Why a module of our own instead of react-native-watch-connectivity: that package covers WCSession only. The HR
// reliability design needs HKHealthStore.startWatchApp (wakes a sleeping watch app for a phone-started workout)
// and workout-session mirroring (live HR on the phone, iOS 17), and keeping the dependency tree unchanged keeps
// the web export and `pnpm install --frozen-lockfile` exactly as they were.
//
// Delivery rules (docs/features/watch.md): the plan goes by updateApplicationContext (latest wins); a start
// request goes by transferUserInfo (queued) plus startWatchApp; whatever the watch sends arrives by
// transferUserInfo and is persisted here until JS drains it, so nothing is lost if JS isn't running yet.

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <WatchConnectivity/WatchConnectivity.h>
#import <HealthKit/HealthKit.h>

static NSString *const kInbox = @"watch.inbox";

@interface SpotterWatchModule : RCTEventEmitter <RCTBridgeModule, WCSessionDelegate, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate>
@end

@implementation SpotterWatchModule {
  HKHealthStore *_store;
  BOOL _listening;
  HKWorkoutSession *_mirrored;
}

RCT_EXPORT_MODULE(SpotterWatch);

+ (BOOL)requiresMainQueueSetup { return YES; }

- (instancetype)init {
  if ((self = [super init])) {
    _store = [HKHealthStore new];
    if ([WCSession isSupported]) {
      WCSession.defaultSession.delegate = self;
      [WCSession.defaultSession activateSession];
    }
    if (@available(iOS 17.0, *)) {
      __weak SpotterWatchModule *weakSelf = self;
      _store.workoutSessionMirroringStartHandler = ^(HKWorkoutSession *session) {
        [weakSelf attachMirrored:session];
      };
    }
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents { return @[ @"inbound", @"status", @"heartRate" ]; }
- (void)startObserving { _listening = YES; }
- (void)stopObserving { _listening = NO; }

- (void)emit:(NSString *)name body:(id)body {
  if (_listening) [self sendEventWithName:name body:body];
}

#pragma mark - JS API

RCT_EXPORT_METHOD(status:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  if (![WCSession isSupported]) {
    resolve(@{ @"supported": @NO, @"paired": @NO, @"installed": @NO, @"reachable": @NO, @"pending": @0 });
    return;
  }
  WCSession *s = WCSession.defaultSession;
  resolve(@{
    @"supported": @YES,
    @"paired": @(s.isPaired),
    @"installed": @(s.isWatchAppInstalled),
    @"reachable": @(s.isReachable),
    @"pending": @(s.outstandingUserInfoTransfers.count),
  });
}

RCT_EXPORT_METHOD(updateContext:(NSString *)json resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  if (![WCSession isSupported] || WCSession.defaultSession.activationState != WCSessionActivationStateActivated) {
    resolve(@NO);
    return;
  }
  NSError *error = nil;
  [WCSession.defaultSession updateApplicationContext:@{ @"v": @1, @"json": json } error:&error];
  if (error) reject(@"context", error.localizedDescription, error);
  else resolve(@YES);
}

RCT_EXPORT_METHOD(startOnWatch:(NSString *)planId activityType:(nonnull NSNumber *)activityType resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  // Queued first, so the watch knows which plan to open even if it wakes before reading its context.
  if ([WCSession isSupported]) {
    NSString *json = [NSString stringWithFormat:@"{\"kind\":\"start\",\"planId\":%@}", [self quoted:planId]];
    [WCSession.defaultSession transferUserInfo:@{ @"v": @1, @"json": json }];
  }
  HKWorkoutConfiguration *config = [HKWorkoutConfiguration new];
  config.activityType = (HKWorkoutActivityType)activityType.unsignedIntegerValue;
  config.locationType = HKWorkoutSessionLocationTypeIndoor;
  // Wakes the watch app (even asleep or in the background) and hands it this configuration.
  [_store startWatchAppWithWorkoutConfiguration:config completion:^(BOOL success, NSError *error) {
    resolve(@(success));
  }];
}

RCT_EXPORT_METHOD(drain:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject) {
  NSUserDefaults *d = NSUserDefaults.standardUserDefaults;
  NSArray *items = [d arrayForKey:kInbox] ?: @[];
  [d removeObjectForKey:kInbox];
  resolve(items);
}

- (NSString *)quoted:(NSString *)s {
  NSData *data = [NSJSONSerialization dataWithJSONObject:@[ s ?: @"" ] options:0 error:nil];
  NSString *arr = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  return [arr substringWithRange:NSMakeRange(1, arr.length - 2)];
}

#pragma mark - WCSessionDelegate

- (void)session:(WCSession *)session activationDidCompleteWithState:(WCSessionActivationState)state error:(NSError *)error {
  dispatch_async(dispatch_get_main_queue(), ^{ [self emit:@"status" body:@{}]; });
}

- (void)sessionDidBecomeInactive:(WCSession *)session {}

- (void)sessionDidDeactivate:(WCSession *)session {
  // The client switched watches: activate again for the new one.
  [WCSession.defaultSession activateSession];
}

- (void)sessionWatchStateDidChange:(WCSession *)session {
  dispatch_async(dispatch_get_main_queue(), ^{ [self emit:@"status" body:@{}]; });
}

- (void)sessionReachabilityDidChange:(WCSession *)session {
  dispatch_async(dispatch_get_main_queue(), ^{ [self emit:@"status" body:@{}]; });
}

- (void)session:(WCSession *)session didReceiveUserInfo:(NSDictionary<NSString *, id> *)userInfo {
  NSString *json = userInfo[@"json"];
  if (![json isKindOfClass:NSString.class]) return;
  dispatch_async(dispatch_get_main_queue(), ^{
    NSUserDefaults *d = NSUserDefaults.standardUserDefaults;
    NSMutableArray *items = [[d arrayForKey:kInbox] ?: @[] mutableCopy];
    [items addObject:json];
    [d setObject:items forKey:kInbox];
    [self emit:@"inbound" body:@{}];
  });
}

#pragma mark - Mirroring (iOS 17): live HR from the watch's workout session

- (void)attachMirrored:(HKWorkoutSession *)session API_AVAILABLE(ios(17.0)) {
  _mirrored = session;
  session.delegate = self;
  session.associatedWorkoutBuilder.delegate = self;
}

- (void)workoutSession:(HKWorkoutSession *)workoutSession didChangeToState:(HKWorkoutSessionState)toState fromState:(HKWorkoutSessionState)fromState date:(NSDate *)date {
  if (toState == HKWorkoutSessionStateEnded) _mirrored = nil;
}

- (void)workoutSession:(HKWorkoutSession *)workoutSession didFailWithError:(NSError *)error {}

- (void)workoutBuilderDidCollectEvent:(HKLiveWorkoutBuilder *)workoutBuilder {}

- (void)workoutBuilder:(HKLiveWorkoutBuilder *)workoutBuilder didCollectDataOfTypes:(NSSet<HKSampleType *> *)collectedTypes {
  HKQuantityType *hr = [HKQuantityType quantityTypeForIdentifier:HKQuantityTypeIdentifierHeartRate];
  if (![collectedTypes containsObject:hr]) return;
  HKQuantity *q = [workoutBuilder statisticsForType:hr].mostRecentQuantity;
  if (!q) return;
  double bpm = [q doubleValueForUnit:[[HKUnit countUnit] unitDividedByUnit:[HKUnit minuteUnit]]];
  dispatch_async(dispatch_get_main_queue(), ^{ [self emit:@"heartRate" body:@{ @"bpm": @(bpm) }]; });
}

@end
