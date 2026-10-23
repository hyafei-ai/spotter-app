// Workout.swift — one HealthKit workout session per training session, and the heart rate it streams.
// NOT COMPILED OR RUN HERE: written against Apple's documented HealthKit APIs (watchOS 10); verify on a device.
//
// The rules, each answering a symptom in the reference app's HR bug brief (docs/features/watch.md):
//  1. One long-lived HKHealthStore for the app's life.
//  2. Exactly one HKWorkoutSession per training session: prepare → startActivity → beginCollection, and at the
//     end session.end() → (delegate: .ended) → endCollection → finishWorkout. A new session can't start until
//     the previous one has finished (calls are serialized on the main actor and wait for `ending`).
//  3. No watchdog that tears the session down and restarts it. If HR is late we say so in words and, after
//     60 s, read HR with an anchored query as a display fallback; the session itself is never recreated.
//  4. A session left running by a crash or kill is recovered through handleActiveWorkoutRecovery() and either
//     reattached to the saved run or ended cleanly, before anything else may start one.
//  5. Authorization is awaited before the first session; HR read access can't be queried (Apple hides it),
//     so "no samples for 30 s while running" is shown as a plain-words hint, not a guess.
//  6. A phone-started workout arrives through handle(_ workoutConfiguration:) (the phone called
//     HKHealthStore.startWatchApp), which wakes the watch app even when it was asleep.
//  7. The session mirrors to the iPhone (watchOS 10 / iOS 17) so the phone can show live HR.

import Foundation
import HealthKit
import WatchKit

@MainActor
final class WorkoutController: NSObject, ObservableObject {
    static let shared = WorkoutController()

    /// Rule 1: one store for the app's whole life.
    let store = HKHealthStore()

    enum State: Equatable { case idle, starting, running, ending }

    @Published private(set) var state: State = .idle
    /// Latest heart rate and when it was measured. The UI shows "—" only once it is older than 15 s.
    @Published private(set) var heartRate: Double?
    @Published private(set) var heartRateAt: Date?
    /// True when the session has run 30 s with no HR sample: show the Settings hint.
    @Published private(set) var heartRateMissing = false
    @Published private(set) var distanceM: Double = 0

    /// Every HR sample this session (time, bpm), for splits, per-minute averages and recovery.
    private(set) var samples: [(at: Date, bpm: Double)] = []

    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var startedAt: Date?
    private var ending: CheckedContinuation<HKWorkout?, Never>?
    private var fallbackQuery: HKAnchoredObjectQuery?
    private var missingCheck: Task<Void, Never>?
    /// Serializes start/end/recover so two callers can never overlap sessions (bug brief H3).
    private var lane: Task<Void, Never>?

    private let bpmUnit = HKUnit.count().unitDivided(by: .minute())

    // MARK: Authorization

    private var authorized = false

    func requestAuthorization() async -> Bool {
        guard HKHealthStore.isHealthDataAvailable() else { return false }
        let share: Set<HKSampleType> = [HKQuantityType.workoutType(), HKQuantityType(.activeEnergyBurned), HKQuantityType(.distanceWalkingRunning)]
        let read: Set<HKObjectType> = [HKQuantityType(.heartRate), HKQuantityType(.activeEnergyBurned), HKQuantityType(.distanceWalkingRunning), HKObjectType.activitySummaryType()]
        do {
            try await store.requestAuthorization(toShare: share, read: read)
            // Only write status is knowable; read status (heart rate) is hidden by design.
            authorized = store.authorizationStatus(for: HKQuantityType.workoutType()) == .sharingAuthorized
        } catch {
            authorized = false
        }
        return authorized
    }

    // MARK: Start

    /// Starts the one workout session for this training session. Safe to call twice: a second call while a
    /// session is starting or running does nothing (it never creates a second session).
    func start(activity: HKWorkoutActivityType, at date: Date = Date()) async {
        await serialized { [self] in
            guard session == nil, state == .idle else { return }
            state = .starting
            if !authorized { _ = await requestAuthorization() }
            let config = HKWorkoutConfiguration()
            config.activityType = activity
            config.locationType = activity == .running ? .outdoor : .indoor
            do {
                let s = try HKWorkoutSession(healthStore: store, configuration: config)
                let b = s.associatedWorkoutBuilder()
                // Data source first, then delegates, then start (Apple's documented order).
                let source = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
                if activity != .running { source.enableCollection(for: HKQuantityType(.distanceWalkingRunning), predicate: nil) }
                b.dataSource = source
                s.delegate = self
                b.delegate = self
                session = s
                builder = b
                resetLive()
                s.prepare()
                s.startActivity(with: date)
                try await b.beginCollection(at: date)
                // Brand name on the saved workout: the trainer's app, never ours (white-label).
                try? await b.addMetadata([HKMetadataKeyWorkoutBrandName: Brand.buildTime.appName])
                startedAt = date
                state = .running
                watchForMissingHeartRate()
                // Live HR on the phone (watchOS 10 / iOS 17). Best effort: the session works without it.
                try? await s.startMirroringToCompanionDevice()
            } catch {
                session = nil
                builder = nil
                state = .idle
            }
        }
    }

    /// The phone woke us with a workout configuration (HKHealthStore.startWatchApp on the iPhone).
    func startFromPhone(_ configuration: HKWorkoutConfiguration) async {
        await start(activity: configuration.activityType)
    }

    // MARK: End

    /// Ends the session and saves the workout. Returns when HealthKit has finished, so the next start can't
    /// race an unfinished session (the "workout #3 has no HR" case).
    @discardableResult
    func end(at date: Date = Date()) async -> HKWorkout? {
        var saved: HKWorkout?
        await serialized { [self] in
            guard let s = session, state == .running || state == .starting else { return }
            state = .ending
            stopFallback()
            missingCheck?.cancel()
            saved = await withCheckedContinuation { (c: CheckedContinuation<HKWorkout?, Never>) in
                ending = c
                s.end()   // → delegate .ended → finish(on:)
            }
            session = nil
            builder = nil
            startedAt = nil
            state = .idle
        }
        return saved
    }

    private func finish(on date: Date) async {
        guard let b = builder else { ending?.resume(returning: nil); ending = nil; return }
        var workout: HKWorkout?
        do {
            try await b.endCollection(at: date)
            workout = try await b.finishWorkout()
        } catch {
            workout = nil
        }
        ending?.resume(returning: workout)
        ending = nil
    }

    // MARK: Recovery (rule 4)

    /// Called from the app delegate's handleActiveWorkoutRecovery(). `keep` says whether a saved run exists to
    /// reattach to; without one, the orphaned session is ended cleanly so it can't block the next one.
    func recover(keep: @escaping @MainActor () -> Bool) async {
        await serialized { [self] in
            let recovered: HKWorkoutSession? = await withCheckedContinuation { c in
                store.recoverActiveWorkoutSession { s, _ in c.resume(returning: s) }
            }
            guard let s = recovered else { return }
            let b = s.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: s.workoutConfiguration)
            s.delegate = self
            b.delegate = self
            session = s
            builder = b
            startedAt = s.startDate
            state = .running
            if keep() { watchForMissingHeartRate() }
        }
        // Outside the lane (end() takes the lane itself). No saved run to reattach to: end the orphan now.
        if session != nil && !keep() { await end() }
    }

    // MARK: Heart rate

    /// Heart rate the UI may show: nil once the last reading is older than 15 s (then the UI says "—").
    func displayHeartRate(now: Date = Date()) -> Int? {
        guard let hr = heartRate, let at = heartRateAt, now.timeIntervalSince(at) <= 15 else { return nil }
        return Int(hr.rounded())
    }

    func samples(from: Date, to: Date) -> [Double] {
        samples.filter { $0.at >= from && $0.at <= to }.map(\.bpm)
    }

    func perMinuteAverages(from start: Date, to end: Date) -> [Int] {
        guard end > start else { return [] }
        let minutes = min(180, Int(ceil(end.timeIntervalSince(start) / 60)))
        return (0..<minutes).map { m in
            let a = start.addingTimeInterval(Double(m) * 60)
            let xs = samples(from: a, to: a.addingTimeInterval(60))
            return xs.isEmpty ? 0 : Int((xs.reduce(0, +) / Double(xs.count)).rounded())
        }
    }

    private func ingest(_ bpm: Double, at date: Date) {
        guard bpm > 0 else { return }
        heartRate = bpm
        heartRateAt = date
        heartRateMissing = false
        samples.append((date, bpm))
    }

    private func resetLive() {
        heartRate = nil
        heartRateAt = nil
        heartRateMissing = false
        distanceM = 0
        samples = []
    }

    /// Rule 3 and 5: words after 30 s; an anchored HR query as a display fallback after 60 s. Never a restart.
    private func watchForMissingHeartRate() {
        missingCheck?.cancel()
        missingCheck = Task { [weak self] in
            try? await Task.sleep(for: .seconds(30))
            guard let self, !Task.isCancelled, self.heartRateAt == nil, self.state == .running else { return }
            self.heartRateMissing = true
            try? await Task.sleep(for: .seconds(30))
            guard !Task.isCancelled, self.heartRateAt == nil, self.state == .running else { return }
            self.startFallback()
        }
    }

    private func startFallback() {
        guard fallbackQuery == nil, let since = startedAt else { return }
        let predicate = HKQuery.predicateForSamples(withStart: since, end: nil, options: .strictStartDate)
        let handler: (HKAnchoredObjectQuery, [HKSample]?, [HKDeletedObject]?, HKQueryAnchor?, Error?) -> Void = { [weak self] _, added, _, _, _ in
            let latest = (added as? [HKQuantitySample])?.max(by: { $0.endDate < $1.endDate })
            guard let latest else { return }
            let bpm = latest.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
            Task { @MainActor [weak self] in self?.ingest(bpm, at: latest.endDate) }
        }
        let q = HKAnchoredObjectQuery(type: HKQuantityType(.heartRate), predicate: predicate, anchor: nil, limit: HKObjectQueryNoLimit, resultsHandler: handler)
        q.updateHandler = handler
        store.execute(q)
        fallbackQuery = q
    }

    private func stopFallback() {
        if let q = fallbackQuery { store.stop(q) }
        fallbackQuery = nil
    }

    // MARK: Serial lane

    private func serialized(_ work: @escaping @MainActor () async -> Void) async {
        let previous = lane
        let next = Task { @MainActor in
            await previous?.value
            await work()
        }
        lane = next
        await next.value
    }
}

// MARK: - HKWorkoutSessionDelegate

extension WorkoutController: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        guard toState == .ended else { return }
        Task { @MainActor in await self.finish(on: date) }
    }

    nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        // No automatic restart (rule 3). If the session ended because of the failure, the .ended transition
        // finishes it; the run keeps logging sets without HR and the UI says so.
        Task { @MainActor in self.heartRateMissing = true }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension WorkoutController: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        let hrType = HKQuantityType(.heartRate)
        let distType = HKQuantityType(.distanceWalkingRunning)
        let unit = HKUnit.count().unitDivided(by: .minute())
        let hr = collectedTypes.contains(hrType) ? workoutBuilder.statistics(for: hrType)?.mostRecentQuantity()?.doubleValue(for: unit) : nil
        let hrAt = collectedTypes.contains(hrType) ? workoutBuilder.statistics(for: hrType)?.mostRecentQuantityDateInterval()?.end : nil
        let dist = collectedTypes.contains(distType) ? workoutBuilder.statistics(for: distType)?.sumQuantity()?.doubleValue(for: .meter()) : nil
        Task { @MainActor in
            if let hr { self.ingest(hr, at: hrAt ?? Date()) }
            if let dist { self.distanceM = dist }
        }
    }
}
