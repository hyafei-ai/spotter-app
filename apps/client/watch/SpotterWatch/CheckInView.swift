// CheckInView.swift — W2: energy, soreness, stress in three taps, the crown sets each one.
// NOT COMPILED OR RUN HERE.

import SwiftUI
import WatchKit

struct CheckInView: View {
    @EnvironmentObject private var link: PhoneLink
    @Environment(\.dismiss) private var dismiss
    @State private var step = 0
    @State private var values: [Double] = [3, 3, 3]
    @State private var saved = false
    @FocusState private var focused: Bool

    private let questions = ["Energy", "Soreness", "Stress"]
    /// Words for 1…5 per question (same ends as the phone's daily check), mirrored from CHECK_IN_WORDS in
    /// packages/core/src/watch.ts.
    private let words = [
        ["Drained", "Low", "OK", "Good", "Full of energy"],
        ["Fresh", "A little", "Some", "Sore", "Very sore"],
        ["Calm", "A little", "Some", "High", "Very stressed"],
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if saved {
                Label(link.pending > 0 ? "Saved · sends when your iPhone is near" : "Sent to your phone", systemImage: "checkmark")
                    .font(.body).foregroundStyle(link.pending > 0 ? Ink.warning : Ink.success)
                Spacer()
                PrimaryButton(title: "Done") { dismiss() }
            } else {
                Text("\(step + 1) of 3").font(.footnote).foregroundStyle(Ink.ink2)
                Text(questions[step]).font(.headline).foregroundStyle(Ink.ink)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("\(Int(values[step]))").font(Fonts.figure(56)).foregroundStyle(Ink.ink)
                    Text(words[step][Int(values[step]) - 1]).font(.body).foregroundStyle(Ink.ink2)
                }
                .focusable()
                .focused($focused)
                .digitalCrownRotation($values[step], from: 1, through: 5, by: 1, sensitivity: .low, isContinuous: false, isHapticFeedbackEnabled: true)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(questions[step]): \(Int(values[step])) of 5, \(words[step][Int(values[step]) - 1])")
                .accessibilityAdjustableAction { dir in
                    values[step] = min(5, max(1, values[step] + (dir == .increment ? 1 : -1)))
                }
                Spacer(minLength: 0)
                PrimaryButton(title: step < 2 ? "Next" : "Save") {
                    if step < 2 { step += 1 } else { save() }
                }
            }
        }
        .padding(.horizontal, 4)
        .background(Ink.paper)
        .onAppear { focused = true }
    }

    private func save() {
        link.send(CheckIn(id: Wire.newId(), date: Wire.localDay(), energy: Int(values[0]), soreness: Int(values[1]), stress: Int(values[2]), at: Wire.stamp()))
        WKInterfaceDevice.current().play(.success)
        saved = true
    }
}
