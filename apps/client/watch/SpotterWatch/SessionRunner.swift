// SessionRunner.swift — runs the coach's session on the wrist, step by step, and builds the result.
// NOT COMPILED OR RUN HERE.
//
// Kept from the reference app's Hyrox engine: wall-clock timing (elapsed is rebuilt from dates, so a crash or
// wrist-down never makes the timer lie), a crash-safe state saved on every change, a 5-second undo after each
// advance, and per-segment HR. Rewritten: the session is the coach's plan as blocks (strength, interval,
// station, timed), not a race template.

import Foundation
import HealthKit
import WatchKit

@MainActor
final class SessionRunner: ObservableObject {
    static let shared = SessionRunner()

    enum Phase: Codable, Equatable {
        /// Waiting for the client (a strength set, the first rep of a block, a timed hold).
        case ready
        /// Interval, station or timed work under way.
        case working(since: Date)
        case resting(until: Date)
        /// Every step is logged: show Finish.
        case complete
        /// Measuring heart-rate recovery after the session.
        case recovery(since: Date)
        case done
    }

    struct Run: Codable, Equatable {
        var resultId: String
        var plan: SessionPlan
        var startedAt: Date
        var step: Int
        var phase: Phase
        var sets: [SetLog] = []
        var intervals: [IntervalLog] = []
        var stations: [StationLog] = []
        var timed: [TimedLog] = []
        var distanceAtWorkStart: Double = 0
        var pausedAt: Date?
        var workEndedAt: Date?
        var peakHr: Int?
        var ended: String?
        var recovery: HrRecovery?
        var sent = false
    }

    @Published private(set) var run: Run? { didSet { save() } }
    /// Undo is offered until this time, and restores `beforeLast`.
    @Published private(set) var undoUntil: Date?
    private var beforeLast: Run?
    private var ticker: Timer?
    private var warnedRestEnd = false

    private let workout = WorkoutController.shared
    private let link = PhoneLink.shared

    private init() {
        run = Self.load()
        if run != nil { startTicker() }
    }

    // MARK: Current step

    var current: (block: Block, b: Int, i: Int)? {
        guard let r = run, r.step < r.plan.order.count else { return nil }
        let pair = r.plan.order[r.step]
        guard pair.count == 2, pair[0] < r.plan.blocks.count else { return nil }
        return (r.plan.blocks[pair[0]], pair[0], pair[1])
    }

    var next: (block: Block, b: Int, i: Int)? {
        guard let r = run, r.step + 1 < r.plan.order.count else { return nil }
        let pair = r.plan.order[r.step + 1]
        return (r.plan.blocks[pair[0]], pair[0], pair[1])
    }

    var loggedCount: Int {
        guard let r = run else { return 0 }
        return r.sets.count + r.intervals.count + r.stations.count + r.timed.count
    }

    var stepCount: Int { run?.plan.order.count ?? 0 }

    /// Load to start a set at: what the client used on this block's previous set today, else the plan.
    func startingLoad(b: Int, i: Int, planned: Double?) -> Double? {
        run?.sets.last(where: { $0.b == b && $0.i < i })?.loadKg ?? planned
    }

    // MARK: Start / resume

    func start(_ plan: SessionPlan) async {
        if let r = run, r.plan.planId == plan.planId, r.phase != .done { return }  // already running: resume
        let now = Date()
        run = Run(resultId: Wire.newId(), plan: plan, startedAt: now, step: 0, phase: entryPhase(forStep: 0, in: plan, after: nil))
        startTicker()
        await workout.start(activity: Self.activity(for: plan), at: now)
        if case .working = run?.phase { run?.distanceAtWorkStart = workout.distanceM }
    }

    static func activity(for plan: SessionPlan) -> HKWorkoutActivityType {
        let kinds = plan.blocks.map { b -> String in
            switch b { case .strength: return "s"; case .interval: return "i"; case .station: return "st"; case .timed: return "t" }
        }
        if kinds.allSatisfy({ $0 == "s" || $0 == "t" }) { return .traditionalStrengthTraining }
        let runsOnly = plan.blocks.allSatisfy { b in
            if case .interval(let x) = b, x.distanceM != nil, case .pace = x.target { return true }
            return false
        }
        return runsOnly ? .running : .highIntensityIntervalTraining
    }

    // MARK: Strength

    func logSet(reps: Int?, loadKg: Double?, rpe: Double?) {
        guard var r = run, let c = current, case .strength(let s) = c.block else { return }
        snapshot()
        r.sets.append(SetLog(b: c.b, i: c.i, reps: reps, loadKg: s.metric == "weight_reps" ? loadKg : nil, rpe: rpe, at: Wire.stamp()))
        WKInterfaceDevice.current().play(.success)
        run = r
        rest(seconds: s.restSec)
    }

    // MARK: Interval / station / timed

    /// Start work on a ready interval rep or timed hold (or the first station).
    func beginWork() {
        guard var r = run, r.phase == .ready else { return }
        r.phase = .working(since: Date())
        r.distanceAtWorkStart = workout.distanceM
        run = r
        WKInterfaceDevice.current().play(.start)
    }

    /// Mark the current work done (Done button, or the work timer ran out).
    func completeWork(now: Date = Date()) {
        guard var r = run, let c = current, case .working(let since) = r.phase else { return }
        snapshot()
        let secs = now.timeIntervalSince(since)
        let hr = workout.samples(from: since, to: now)
        let avg = hr.isEmpty ? nil : Int((hr.reduce(0, +) / Double(hr.count)).rounded())
        let mx = hr.max().map { Int($0.rounded()) }
        switch c.block {
        case .interval(let x):
            let moved = workout.distanceM - r.distanceAtWorkStart
            r.intervals.append(IntervalLog(b: c.b, i: c.i, workSec: secs, distanceM: x.distanceM ?? (moved > 0 ? moved : nil), avgHr: avg, maxHr: mx))
            run = r
            WKInterfaceDevice.current().play(.stop)
            rest(seconds: x.restSec)
        case .station:
            r.stations.append(StationLog(b: c.b, sec: secs, avgHr: avg, maxHr: mx))
            run = r
            WKInterfaceDevice.current().play(.success)
            advance()
        case .timed:
            r.timed.append(TimedLog(b: c.b, sec: secs))
            run = r
            WKInterfaceDevice.current().play(.success)
            advance()
        case .strength:
            break
        }
    }

    // MARK: Rest

    private func rest(seconds: Int) {
        guard var r = run else { return }
        if seconds <= 0 || r.step + 1 >= r.plan.order.count { advance(); return }
        r.phase = .resting(until: Date().addingTimeInterval(Double(seconds)))
        warnedRestEnd = false
        run = r
    }

    func skipRest() { advance() }

    /// Crown on the rest screen: ±15 s, never below 5 s left.
    func adjustRest(by seconds: Double) {
        guard var r = run, case .resting(let until) = r.phase else { return }
        r.phase = .resting(until: max(Date().addingTimeInterval(5), until.addingTimeInterval(seconds)))
        run = r
    }

    private func advance() {
        guard var r = run else { return }
        let previous = current
        r.step += 1
        if r.step >= r.plan.order.count {
            r.phase = .complete
        } else {
            r.phase = entryPhase(forStep: r.step, in: r.plan, after: previous?.b)
            r.distanceAtWorkStart = workout.distanceM
        }
        run = r
        undoUntil = Date().addingTimeInterval(5)
    }

    /// Intervals continue rep to rep, and conditioning blocks flow into each other (Hyrox-style); a strength set
    /// or a timed hold waits for the client.
    private func entryPhase(forStep step: Int, in plan: SessionPlan, after previousBlock: Int?) -> Phase {
        let b = plan.order[step][0]
        switch plan.blocks[b] {
        case .strength, .timed: return .ready
        case .interval: return previousBlock == b ? .working(since: Date()) : .ready
        case .station:
            guard let p = previousBlock else { return .ready }
            switch plan.blocks[p] { case .interval, .station: return .working(since: Date()); default: return .ready }
        }
    }

    // MARK: Undo

    private func snapshot() {
        beforeLast = run
        undoUntil = Date().addingTimeInterval(5)
    }

    var canUndo: Bool { (undoUntil ?? .distantPast) > Date() && beforeLast != nil }

    func undo() {
        guard canUndo, let previous = beforeLast else { return }
        WKInterfaceDevice.current().play(.click)
        run = previous
        beforeLast = nil
        undoUntil = nil
    }

    // MARK: Pause

    func pause() {
        guard var r = run, r.pausedAt == nil else { return }
        r.pausedAt = Date()
        run = r
    }

    func resume() {
        guard var r = run, let at = r.pausedAt else { return }
        let gap = Date().timeIntervalSince(at)
        switch r.phase {
        case .working(let since): r.phase = .working(since: since.addingTimeInterval(gap))
        case .resting(let until): r.phase = .resting(until: until.addingTimeInterval(gap))
        default: break
        }
        r.pausedAt = nil
        run = r
    }

    // MARK: Finish, recovery, result

    /// Finish (all logged) or End and save (early). Measures HR recovery when there is heart rate.
    func finish(early: Bool) {
        guard var r = run else { return }
        let now = Date()
        r.ended = early ? "ended_early" : "finished"
        r.workEndedAt = now
        r.pausedAt = nil
        let lastMinute = workout.samples(from: now.addingTimeInterval(-60), to: now)
        r.peakHr = lastMinute.max().map { Int($0.rounded()) }
        r.phase = r.peakHr == nil ? .done : .recovery(since: now)
        run = r
        if r.peakHr == nil { Task { await self.complete() } }
    }

    /// Skip (or the 2 minutes are up): keep what was measured so far.
    func endRecovery() { Task { await complete() } }

    private func complete() async {
        guard var r = run, !r.sent, let ended = r.workEndedAt else { return }
        // Mirror of packages/core/src/watch.ts hrRecoveryFrom: the reading nearest 60 s and 120 s, each ±10 s.
        if let peak = r.peakHr {
            let after = workout.samples.filter { $0.at > ended }.map { (t: $0.at.timeIntervalSince(ended), bpm: $0.bpm) }
            func near(_ target: Double) -> Int? {
                after.filter { abs($0.t - target) <= 10 }.min(by: { abs($0.t - target) < abs($1.t - target) }).map { Int($0.bpm.rounded()) }
            }
            r.recovery = HrRecovery(peak: peak, at60: near(60), at120: near(120))
        }
        let all = workout.samples(from: r.startedAt, to: ended).map(\.bpm)
        let summary = all.isEmpty ? nil : HrSummary(avg: Int((all.reduce(0, +) / Double(all.count)).rounded()),
                                                     max: all.max().map { Int($0.rounded()) },
                                                     perMinute: workout.perMinuteAverages(from: r.startedAt, to: ended))
        await workout.end()
        let result = SessionResult(resultId: r.resultId, planId: r.plan.planId, programDayId: r.plan.programDayId, date: r.plan.date,
                                   title: r.plan.title, version: r.plan.version, startedAt: Wire.stamp(r.startedAt), endedAt: Wire.stamp(ended),
                                   ended: r.ended ?? "finished", sets: r.sets, intervals: r.intervals, stations: r.stations, timed: r.timed,
                                   hr: summary, hrRecovery: r.recovery)
        link.send(result)
        r.sent = true
        r.phase = .done
        run = r
        WKInterfaceDevice.current().play(.success)
    }

    /// Done screen → back to Today. The run stays on disk until today ends, so Today can show "done".
    func dismiss() {
        stopTicker()
        run = nil
    }

    // MARK: Ticker (rest end, timed work, recovery) — runs in the background while the workout session is active

    private func startTicker() {
        ticker?.invalidate()
        let t = Timer(timeInterval: 0.5, repeats: true) { [weak self] _ in Task { @MainActor in self?.tick(Date()) } }
        RunLoop.main.add(t, forMode: .common)
        ticker = t
    }

    private func stopTicker() {
        ticker?.invalidate()
        ticker = nil
    }

    func tick(_ now: Date) {
        guard let r = run, r.pausedAt == nil else { return }
        switch r.phase {
        case .resting(let until):
            let left = until.timeIntervalSince(now)
            if left <= 10 && !warnedRestEnd { warnedRestEnd = true; WKInterfaceDevice.current().play(.notification) }
            if left <= 0 { WKInterfaceDevice.current().play(.success); advance() }
        case .working(let since):
            guard let c = current else { return }
            let elapsed = now.timeIntervalSince(since)
            switch c.block {
            case .interval(let x):
                if let w = x.workSec {
                    let left = Double(w) - elapsed
                    if left <= 3 && left > 0 && Int(left * 2) % 2 == 0 { WKInterfaceDevice.current().play(.click) }
                    if left <= 0 { completeWork(now: since.addingTimeInterval(Double(w))) }
                }
            case .timed(let x):
                if elapsed >= Double(x.seconds) { completeWork(now: since.addingTimeInterval(Double(x.seconds))) }
            default: break
            }
        case .recovery(let since):
            if now.timeIntervalSince(since) >= 120 { endRecovery() }
        default: break
        }
    }

    // MARK: Persistence (crash-safe: written on every change)

    private static var fileURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("run.json")
    }

    private func save() {
        guard let run else { try? FileManager.default.removeItem(at: Self.fileURL); return }
        if let data = try? JSONEncoder().encode(run) { try? data.write(to: Self.fileURL, options: .atomic) }
    }

    private static func load() -> Run? {
        guard let data = try? Data(contentsOf: fileURL), let r = try? JSONDecoder().decode(Run.self, from: data) else { return nil }
        // A finished run from an earlier day is done with.
        if r.phase == .done && r.plan.date != Wire.localDay() { return nil }
        return r
    }

    /// Used by workout recovery: is there a run to reattach the recovered HealthKit session to?
    var hasLiveRun: Bool {
        guard let r = run else { return false }
        switch r.phase { case .done: return false; default: return true }
    }
}
