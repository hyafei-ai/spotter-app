// SessionViews.swift — W3–W10: the session on the wrist, one screen per block kind.
// NOT COMPILED OR RUN HERE.
//
// Glanceability rules (docs/ux/watch.md §7): one thing per screen; the number the client needs is the biggest
// thing on it; the primary action is always bottom, full width; phase words ("Rest", "Work", "Paused") are
// always written, colour only repeats them; live HR small, top right.

import SwiftUI
import WatchKit

/// Routes the running session to its screen.
struct SessionView: View {
    @EnvironmentObject private var runner: SessionRunner
    @State private var showMenu = false

    var body: some View {
        Group {
            if let run = runner.run {
                if run.pausedAt != nil {
                    PausedView()
                } else {
                    switch run.phase {
                    case .resting(let until): RestView(until: until)
                    case .complete: FinishView(early: false)
                    case .recovery(let since): RecoveryView(since: since)
                    case .done: DoneView()
                    case .ready, .working: stepView
                    }
                }
            }
        }
        .background(Ink.paper)
        .toolbar {
            if runner.run.map({ if case .done = $0.phase { return false }; if case .recovery = $0.phase { return false }; return true }) ?? false {
                ToolbarItem(placement: .topBarLeading) {
                    Button { showMenu = true } label: { Image(systemName: "ellipsis") }
                        .accessibilityLabel("Pause or end")
                }
            }
        }
        .sheet(isPresented: $showMenu) { SessionMenu() }
    }

    @ViewBuilder
    private var stepView: some View {
        if let c = runner.current {
            switch c.block {
            case .strength(let s): SetView(block: s, b: c.b, i: c.i)
            case .interval(let x): IntervalView(block: x, i: c.i)
            case .station(let x): StationView(block: x, b: c.b)
            case .timed(let x): TimedView(block: x)
            }
        }
    }
}

// MARK: - W3 Set

struct SetView: View {
    @EnvironmentObject private var runner: SessionRunner
    @EnvironmentObject private var link: PhoneLink
    let block: Block.Strength
    let b: Int
    let i: Int

    @State private var reps: Double = 0
    @State private var load: Double = 0
    @State private var focus: Field = .reps
    @State private var askRpe = false
    @FocusState private var crown: Bool

    enum Field { case reps, load }

    private var planned: StrengthSet { block.sets[min(i, block.sets.count - 1)] }
    private var units: String { runner.run?.plan.units ?? "kg" }
    private var increment: Double { runner.run?.plan.incrementKg ?? 2.5 }
    private var weighted: Bool { block.metric == "weight_reps" && planned.loadKg != nil }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            StepHeader(title: block.name, detail: setLine)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                if weighted {
                    number(Fmt.load(load, units: units).replacingOccurrences(of: " \(units)", with: ""), unit: units, field: .load)
                    Text("×").font(Fonts.figure(28)).foregroundStyle(Ink.ink2)
                }
                number(planned.reps == nil && reps == 0 ? "Max" : "\(Int(reps))", unit: "reps", field: .reps)
            }
            .focusable()
            .focused($crown)
            .digitalCrownRotation(crownBinding, from: crownRange.lowerBound, through: crownRange.upperBound, by: crownStep,
                                  sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
            if let rpe = planned.rpe { Text("RPE \(rpe.formatted())").font(.footnote).foregroundStyle(Ink.ink2) }
            if let cal = runner.run?.plan.calibration, i == 0 { Text(cal).font(.caption2).foregroundStyle(Ink.ink2).lineLimit(2) }
            Spacer(minLength: 0)
            PrimaryButton(title: "Log set", accessibility: logLabel) {
                if block.trackRpe { askRpe = true } else { runner.logSet(reps: Int(reps), loadKg: weighted ? load : nil, rpe: nil) }
            }
        }
        .onAppear(perform: reset)
        .onChange(of: i) { _, _ in reset() }
        .sheet(isPresented: $askRpe) {
            RpeView(target: planned.rpe) { rpe in
                askRpe = false
                runner.logSet(reps: Int(reps), loadKg: weighted ? load : nil, rpe: rpe)
            }
        }
    }

    private var setLine: String {
        let group = block.group.map { "\($0) · " } ?? ""
        return "\(group)Set \(i + 1) of \(block.sets.count)"
    }

    private var logLabel: String {
        weighted ? "Log set: \(Fmt.load(load, units: units)), \(Int(reps)) reps" : "Log set: \(Int(reps)) reps"
    }

    private var crownBinding: Binding<Double> { focus == .reps ? $reps : $load }
    private var crownRange: ClosedRange<Double> { focus == .reps ? 0...100 : 0...1000 }
    private var crownStep: Double { focus == .reps ? 1 : increment }

    private func number(_ text: String, unit: String, field: Field) -> some View {
        Button { focus = field; crown = true } label: {
            VStack(alignment: .leading, spacing: 0) {
                Text(text).font(Fonts.figure(focus == field ? 52 : 40)).foregroundStyle(Ink.ink)
                Text(unit).font(.caption2).foregroundStyle(focus == field ? Ink.ink : Ink.ink2)
            }
            .padding(.bottom, 2)
            .overlay(alignment: .bottom) {
                if focus == field { Rectangle().fill(link.brand.accent).frame(height: 2) }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(text) \(unit)")
        .accessibilityHint("Turn the Digital Crown to change")
        .accessibilityAdjustableAction { dir in
            let step = field == .reps ? 1 : increment
            if field == .reps { reps = max(0, reps + (dir == .increment ? step : -step)) } else { load = max(0, load + (dir == .increment ? step : -step)) }
        }
    }

    private func reset() {
        reps = Double(planned.reps ?? 0)
        load = runner.startingLoad(b: b, i: i, planned: planned.loadKg) ?? 0
        focus = .reps
        crown = true
    }
}

/// After Log set, only when the coach asked for RPE on this exercise.
struct RpeView: View {
    let target: Double?
    let save: (Double?) -> Void
    @State private var rpe: Double = 8
    @FocusState private var crown: Bool

    private func words(_ v: Double) -> String {
        switch v {
        case 10: return "Nothing left"
        case 9..<10: return "1 left in the tank"
        case 8..<9: return "2 left in the tank"
        case 7..<8: return "3 left in the tank"
        default: return "4 or more left"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("How hard was it?").font(.headline).foregroundStyle(Ink.ink)
            Text(rpe.formatted()).font(Fonts.figure(56)).foregroundStyle(Ink.ink)
                .focusable().focused($crown)
                .digitalCrownRotation($rpe, from: 6, through: 10, by: 0.5, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
                .accessibilityLabel("RPE \(rpe.formatted()), \(words(rpe))")
                .accessibilityAdjustableAction { d in rpe = min(10, max(6, rpe + (d == .increment ? 0.5 : -0.5))) }
            Text(words(rpe)).font(.footnote).foregroundStyle(Ink.ink2)
            Spacer(minLength: 0)
            PrimaryButton(title: "Save") { save(rpe) }
            Button("Skip") { save(nil) }.buttonStyle(.plain).font(.footnote).foregroundStyle(Ink.ink2)
        }
        .onAppear { rpe = target ?? 8; crown = true }
    }
}

// MARK: - W4 Rest

struct RestView: View {
    @EnvironmentObject private var runner: SessionRunner
    let until: Date
    @State private var crown: Double = 0
    @FocusState private var focused: Bool

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            VStack(alignment: .leading, spacing: 2) {
                StepHeader(title: "Rest", detail: nil)
                Text(Fmt.clock(until.timeIntervalSince(ctx.date)))
                    .font(Fonts.figure(64)).foregroundStyle(Ink.ink)
                    .focusable().focused($focused)
                    .digitalCrownRotation($crown, from: -600, through: 600, by: 15, sensitivity: .low, isContinuous: true, isHapticFeedbackEnabled: true)
                    .onChange(of: crown) { old, new in runner.adjustRest(by: new - old) }
                    .accessibilityLabel("Rest, \(Int(max(0, until.timeIntervalSince(ctx.date)))) seconds left")
                if let n = runner.current { Text("Next: \(nextLine(n))").font(.footnote).foregroundStyle(Ink.ink2).lineLimit(2) }
                if runner.canUndo {
                    UndoButton()
                }
                Spacer(minLength: 0)
                PrimaryButton(title: "Skip rest") { runner.skipRest() }
            }
        }
        .onAppear { focused = true }
    }

    /// During rest, `current` is still the step just logged; the next one is what's coming.
    private func nextLine(_ c: (block: Block, b: Int, i: Int)) -> String {
        guard let n = runner.next else { return "Finish" }
        let units = runner.run?.plan.units ?? "kg"
        switch n.block {
        case .strength(let s):
            let set = s.sets[min(n.i, s.sets.count - 1)]
            let load = runner.startingLoad(b: n.b, i: n.i, planned: set.loadKg)
            let target = [load.map { Fmt.load($0, units: units) }, set.reps.map { "× \($0)" }].compactMap { $0 }.joined(separator: " ")
            return "\(s.name) · set \(n.i + 1) · \(target)"
        case .interval(let x): return "\(x.name) · \(n.i + 1) of \(x.reps)"
        case .station(let x): return x.name
        case .timed(let x): return "\(x.name) · \(Fmt.clock(Double(x.seconds)))"
        }
    }
}

// MARK: - W5 Interval

struct IntervalView: View {
    @EnvironmentObject private var runner: SessionRunner
    @EnvironmentObject private var workout: WorkoutController
    let block: Block.Interval
    let i: Int

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            VStack(alignment: .leading, spacing: 2) {
                StepHeader(title: block.name, detail: "\(phaseWord) · \(i + 1) of \(block.reps)")
                Text(bigNumber(ctx.date)).font(Fonts.figure(60)).foregroundStyle(Ink.ink)
                    .accessibilityLabel(bigNumber(ctx.date))
                if let t = targetLine { Text(t).font(.footnote).foregroundStyle(Ink.ink2) }
                Spacer(minLength: 0)
                if case .ready = runner.run?.phase {
                    PrimaryButton(title: "Start") { runner.beginWork() }
                } else if block.workSec == nil {
                    PrimaryButton(title: "Done", accessibility: "Done with \(block.name) \(i + 1)") { runner.completeWork() }
                }
            }
        }
    }

    private var phaseWord: String {
        if case .working = runner.run?.phase { return "Work" }
        return "Ready"
    }

    private func bigNumber(_ now: Date) -> String {
        guard case .working(let since) = runner.run?.phase else {
            if let w = block.workSec { return Fmt.clock(Double(w)) }
            return Fmt.distance(block.distanceM ?? 0)
        }
        if let w = block.workSec { return Fmt.clock(Double(w) - now.timeIntervalSince(since)) }
        return Fmt.clock(now.timeIntervalSince(since))
    }

    private var targetLine: String? {
        let dist = block.workSec == nil ? block.distanceM.map { Fmt.distance($0) } : nil
        let target: String? = {
            switch block.target {
            case .pace(let s): return "Target \(Fmt.pace(s))"
            case .watts(let w): return "Target \(w) W"
            case .hrZone(let z): return "Target zone \(z)"
            case .rpe(let r): return "Target RPE \(r.formatted())"
            case nil: return nil
            }
        }()
        return [dist, target].compactMap { $0 }.joined(separator: " · ").nilIfEmpty
    }
}

extension String { var nilIfEmpty: String? { isEmpty ? nil : self } }

// MARK: - W6 Station

struct StationView: View {
    @EnvironmentObject private var runner: SessionRunner
    let block: Block.Station
    let b: Int

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            VStack(alignment: .leading, spacing: 2) {
                StepHeader(title: block.name, detail: spec)
                Text(elapsed(ctx.date)).font(Fonts.figure(56)).foregroundStyle(Ink.ink)
                    .accessibilityLabel("Time on this station \(elapsed(ctx.date))")
                if runner.canUndo {
                    UndoButton()
                }
                Spacer(minLength: 0)
                if case .ready = runner.run?.phase {
                    PrimaryButton(title: "Start") { runner.beginWork() }
                } else {
                    PrimaryButton(title: "Done", accessibility: "Done with \(block.name)") { runner.completeWork() }
                        .frame(minHeight: 64)
                }
            }
        }
    }

    private var spec: String {
        let units = runner.run?.plan.units ?? "kg"
        return [block.distanceM.map { Fmt.distance($0) }, block.reps.map { "\($0) reps" }, block.loadKg.map { Fmt.load($0, units: units) }]
            .compactMap { $0 }.joined(separator: " · ")
    }

    private func elapsed(_ now: Date) -> String {
        guard case .working(let since) = runner.run?.phase else { return "0:00" }
        return Fmt.clock(now.timeIntervalSince(since))
    }
}

// MARK: - W7 Timed

struct TimedView: View {
    @EnvironmentObject private var runner: SessionRunner
    let block: Block.Timed

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            VStack(alignment: .leading, spacing: 2) {
                StepHeader(title: block.name, detail: isWorking ? "Hold" : "Ready")
                Text(left(ctx.date)).font(Fonts.figure(60)).foregroundStyle(Ink.ink)
                Spacer(minLength: 0)
                if isWorking {
                    PrimaryButton(title: "Done early") { runner.completeWork() }
                } else {
                    PrimaryButton(title: "Start") { runner.beginWork() }
                }
            }
        }
    }

    private var isWorking: Bool { if case .working = runner.run?.phase { return true }; return false }

    private func left(_ now: Date) -> String {
        guard case .working(let since) = runner.run?.phase else { return Fmt.clock(Double(block.seconds)) }
        return Fmt.clock(Double(block.seconds) - now.timeIntervalSince(since))
    }
}

// MARK: - Pause / end

struct SessionMenu: View {
    @EnvironmentObject private var runner: SessionRunner
    @Environment(\.dismiss) private var dismiss
    @State private var confirmEnd = false

    var body: some View {
        VStack(spacing: 8) {
            if confirmEnd {
                Text("End and save \(runner.loggedCount) of \(runner.stepCount)?").font(.headline).foregroundStyle(Ink.ink)
                    .multilineTextAlignment(.center)
                PrimaryButton(title: "End and save") { dismiss(); runner.finish(early: true) }
                Button("Keep going") { dismiss() }.buttonStyle(.plain).foregroundStyle(Ink.ink2)
            } else {
                PrimaryButton(title: "Pause") { runner.pause(); dismiss() }
                Button("End session") { confirmEnd = true }.buttonStyle(.bordered).foregroundStyle(Ink.error)
            }
        }
        .padding(.horizontal, 4)
    }
}

struct PausedView: View {
    @EnvironmentObject private var runner: SessionRunner

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Paused").font(Fonts.figure(40)).foregroundStyle(Ink.ink)
            if let c = runner.current { Text(c.block.name).font(.body).foregroundStyle(Ink.ink2) }
            Spacer(minLength: 0)
            PrimaryButton(title: "Resume") { runner.resume() }
        }
    }
}

// MARK: - W8 Finish, W9 Recovery, W10 Done

struct FinishView: View {
    @EnvironmentObject private var runner: SessionRunner
    let early: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("All logged").font(Fonts.figure(36)).foregroundStyle(Ink.ink)
            Text("\(runner.loggedCount) of \(runner.stepCount) · \(minutes) min").font(.body).foregroundStyle(Ink.ink2)
            if runner.canUndo {
                UndoButton()
            }
            Spacer(minLength: 0)
            PrimaryButton(title: "Finish") { runner.finish(early: early) }
        }
    }

    private var minutes: Int { Int(Date().timeIntervalSince(runner.run?.startedAt ?? Date()) / 60) }
}

struct RecoveryView: View {
    @EnvironmentObject private var runner: SessionRunner
    @EnvironmentObject private var workout: WorkoutController
    @EnvironmentObject private var link: PhoneLink
    let since: Date

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            VStack(alignment: .leading, spacing: 2) {
                Text("Keep still").font(.headline).foregroundStyle(Ink.ink)
                Text(Fmt.clock(120 - ctx.date.timeIntervalSince(since))).font(Fonts.figure(56)).foregroundStyle(Ink.ink)
                    .accessibilityLabel("Measuring heart rate recovery, \(Int(max(0, 120 - ctx.date.timeIntervalSince(since)))) seconds left")
                Text("Peak \(runner.run?.peakHr ?? 0) · now \(workout.displayHeartRate(now: ctx.date).map(String.init) ?? "—")")
                    .font(.footnote).foregroundStyle(Ink.ink2)
                Text(link.context?.shareHr == false ? "Measuring how fast your heart rate comes down" : "Shows \(link.brand.coachFirst) how you’re recovering")
                    .font(.caption2).foregroundStyle(Ink.ink2).lineLimit(2)
                Spacer(minLength: 0)
                PrimaryButton(title: "Skip") { runner.endRecovery() }
            }
        }
    }
}

struct DoneView: View {
    @EnvironmentObject private var runner: SessionRunner

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Tally(count: runner.loggedCount)
                Text("\(runner.run?.plan.title ?? "Session") · \(runner.loggedCount) logged").font(.headline).foregroundStyle(Ink.ink)
                if let line = recoveryLine { Text(line).font(.body).foregroundStyle(Ink.ink) }
                else { Text("No heart rate this time. Saved without it.").font(.footnote).foregroundStyle(Ink.ink2) }
                SentLine()
                PrimaryButton(title: "Done") { runner.dismiss() }
            }
        }
    }

    /// Mirror of hrRecoveryLine in packages/core/src/watch.ts. Explain, don't score: no categories.
    private var recoveryLine: String? {
        guard let r = runner.run?.recovery, let a = r.at60 else { return nil }
        let d60 = r.peak - a
        if let b = r.at120 { return "Down \(d60) bpm in the first minute, \(r.peak - b) after two" }
        return "Down \(d60) bpm in the first minute"
    }
}
