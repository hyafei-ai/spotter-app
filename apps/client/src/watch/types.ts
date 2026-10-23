/**
 * The phone's side of the Apple Watch link (docs/features/watch.md). On iOS builds made with SPOTTER_WATCH=1 the
 * config plugin adds a small native module (`SpotterWatch`: WCSession + HKHealthStore.startWatchApp + workout
 * mirroring); everywhere else (web, Android, iOS builds without the watch) `available` is false and every call
 * is a no-op, so nothing else in the app needs to know.
 */
export interface WatchStatus {
  /** WCSession is supported on this device (an iPhone). */
  supported: boolean;
  /** An Apple Watch is paired with this iPhone. */
  paired: boolean;
  /** The watch app is installed on that watch. */
  installed: boolean;
  /** The watch app is running and reachable right now. */
  reachable: boolean;
  /** Payloads from the phone the system hasn't delivered yet. */
  pending: number;
}

export interface WatchNative {
  available: boolean;
  status(): Promise<WatchStatus>;
  /** Replace the watch's application context (latest wins). `json` is a WatchContext. */
  updateContext(json: string): Promise<void>;
  /** Queue {kind:'start', planId} and wake the watch app with HKHealthStore.startWatchApp. */
  startOnWatch(planId: string, activityType: number): Promise<boolean>;
  /** Everything the watch sent since the last drain (JSON strings), persisted natively until drained. */
  drain(): Promise<string[]>;
  onInbound(cb: () => void): () => void;
  onStatus(cb: () => void): () => void;
  /** Live heart rate from the mirrored workout session (iOS 17+), while a watch session runs. */
  onHeartRate(cb: (bpm: number) => void): () => void;
}

export const NO_STATUS: WatchStatus = { supported: false, paired: false, installed: false, reachable: false, pending: 0 };
