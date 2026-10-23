// Components.swift — the few pieces every watch screen shares.
// NOT COMPILED OR RUN HERE.

import SwiftUI

/// The one primary action: bottom of the screen, full width, the trainer's accent fill.
struct PrimaryButton: View {
    @EnvironmentObject private var link: PhoneLink
    let title: String
    var accessibility: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(.headline, design: .default).weight(.semibold))
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: 44)
        }
        .buttonStyle(.borderedProminent)
        .tint(link.brand.accent)
        .foregroundStyle(link.brand.accentInk)
        .accessibilityLabel(accessibility ?? title)
    }
}

/// Live heart rate, small and top-right: useful, never the hero. "—" once the last reading is older than 15 s.
struct HeartRateBadge: View {
    @EnvironmentObject private var workout: WorkoutController

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { ctx in
            let hr = workout.displayHeartRate(now: ctx.date)
            HStack(spacing: 2) {
                Image(systemName: "heart.fill").font(.caption2).foregroundStyle(Ink.ink2)
                Text(hr.map(String.init) ?? "—").font(Fonts.figure(18, relativeTo: .caption)).foregroundStyle(Ink.ink)
                Text("bpm").font(.caption2).foregroundStyle(Ink.ink2)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(hr.map { "Heart rate \($0) beats per minute" } ?? "Heart rate not available")
        }
    }
}

/// Step title (full width, under the system clock), then the detail line with live HR on its right.
struct StepHeader: View {
    let title: String
    let detail: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(.headline).foregroundStyle(Ink.ink).lineLimit(1).minimumScaleFactor(0.7)
                .accessibilityAddTraits(.isHeader)
            HStack(alignment: .firstTextBaseline) {
                if let detail { Text(detail).font(.footnote).foregroundStyle(Ink.ink2).lineLimit(1) }
                Spacer(minLength: 4)
                HeartRateBadge()
            }
        }
    }
}

/// "Undo last" for 5 seconds after an advance (the reference's undo window), with an icon so it reads as a button.
struct UndoButton: View {
    @EnvironmentObject private var runner: SessionRunner

    var body: some View {
        Button { runner.undo() } label: {
            Label("Undo last", systemImage: "arrow.uturn.backward").font(.footnote).foregroundStyle(Ink.ink2)
        }
        .buttonStyle(.plain)
        .frame(minHeight: 32)
    }
}

/// The feel line with the chalk strike under one word (art direction's signature; Today only).
struct StrikeLine: View {
    @EnvironmentObject private var link: PhoneLink
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let text: String
    let word: String?
    @State private var drawn: CGFloat = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(text)
                .font(Fonts.figure(30, relativeTo: .title2))
                .foregroundStyle(Ink.ink)
                .lineLimit(3)
                .minimumScaleFactor(0.8)
                .accessibilityAddTraits(.isHeader)
            if word != nil {
                // Under the feel line, drawn once (art direction: the strike; Reduce Motion draws it at once).
                StrikeShape()
                    .trim(from: 0, to: drawn)
                    .stroke(link.brand.accent, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .frame(width: 64, height: 6)
                    .accessibilityHidden(true)
            }
        }
        .onAppear {
            if reduceMotion { drawn = 1 } else { withAnimation(.easeOut(duration: 0.26)) { drawn = 1 } }
        }
    }
}

/// A short hand-drawn stroke, like a tally on a gym whiteboard.
struct StrikeShape: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: r.minX, y: r.maxY * 0.75))
        p.addQuadCurve(to: CGPoint(x: r.maxX, y: r.minY + r.height * 0.3), control: CGPoint(x: r.midX, y: r.maxY * 0.55))
        return p
    }
}

/// The session's tally on Done: groups of five (four uprights and a diagonal). The only celebration.
struct Tally: View {
    @EnvironmentObject private var link: PhoneLink
    let count: Int

    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<max(1, Int(ceil(Double(count) / 5))), id: \.self) { g in
                let n = min(5, count - g * 5)
                Canvas { ctx, size in
                    var p = Path()
                    for k in 0..<min(4, n) {
                        let x = CGFloat(k) * size.width / 4 + 3
                        p.move(to: CGPoint(x: x, y: 2)); p.addLine(to: CGPoint(x: x - 1, y: size.height - 2))
                    }
                    if n == 5 { p.move(to: CGPoint(x: 0, y: size.height - 4)); p.addLine(to: CGPoint(x: size.width, y: 4)) }
                    ctx.stroke(p, with: .color(link.brand.accent), style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                }
                .frame(width: 26, height: 22)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(count) logged")
    }
}

/// Where the session went, in words (never colour alone).
struct SentLine: View {
    @EnvironmentObject private var link: PhoneLink

    var body: some View {
        let first = link.brand.coachFirst
        if link.pending > 0 {
            Label("Saved on your watch · sends when your iPhone is near", systemImage: "clock")
                .font(.footnote).foregroundStyle(Ink.warning)
        } else {
            Label(first.isEmpty ? "Sent" : "Sent to \(first)", systemImage: "checkmark")
                .font(.footnote).foregroundStyle(Ink.success)
        }
    }
}

enum Fmt {
    static func load(_ kg: Double?, units: String) -> String {
        guard let kg else { return "" }
        let v = units == "lb" ? kg * 2.20462 : kg
        let s = v.rounded() == v ? String(Int(v)) : String(format: "%.1f", v)
        return "\(s) \(units)"
    }

    static func clock(_ seconds: Double) -> String {
        let s = max(0, Int(seconds.rounded(.up)))
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    static func distance(_ m: Double) -> String {
        m >= 1000 ? (m.truncatingRemainder(dividingBy: 1000) == 0 ? "\(Int(m / 1000)) km" : String(format: "%.1f km", m / 1000)) : "\(Int(m)) m"
    }

    static func pace(_ secPerKm: Int) -> String { String(format: "%d:%02d /km", secPerKm / 60, secPerKm % 60) }

    static func time(_ date: Date) -> String {
        let f = DateFormatter()
        f.timeStyle = .short
        return f.string(from: date)
    }
}
