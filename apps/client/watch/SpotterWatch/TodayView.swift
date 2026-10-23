// TodayView.swift — W1 Today: how today looks, and one action. Crown scrolls to the secondary rows.
// NOT COMPILED OR RUN HERE.

import SwiftUI

struct TodayView: View {
    @EnvironmentObject private var link: PhoneLink
    @EnvironmentObject private var runner: SessionRunner
    @State private var showCheckIn = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                header
                if let ctx = link.context {
                    content(ctx)
                } else {
                    // Never synced: the phone app hasn't sent anything yet.
                    Text("Open \(link.brand.appName) on your iPhone once to bring today’s plan here.")
                        .font(.body).foregroundStyle(Ink.ink)
                        .padding(.top, 8)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(Ink.paper)
        .sheet(isPresented: $showCheckIn) { CheckInView() }
    }

    private var header: some View {
        // Monogram on the left: the system clock owns the top right.
        HStack(spacing: 6) {
            Text(link.brand.monogram)
                .font(Fonts.figure(14, relativeTo: .caption))
                .foregroundStyle(link.brand.accentInk)
                .frame(width: 24, height: 24)
                .background(Circle().fill(link.brand.accent))
                .accessibilityLabel("Coached by \(link.brand.coachName)")
            Text(dateLine).font(.footnote).foregroundStyle(Ink.ink2)
            Spacer()
        }
    }

    @ViewBuilder
    private func content(_ ctx: WatchContext) -> some View {
        let plans = ctx.plans
        let recommended = plans.first

        if let feel = ctx.brief?.feel {
            StrikeLine(text: feel, word: ctx.brief?.strike)
            if let reason = ctx.brief?.reason {
                Text(reason).font(.footnote).foregroundStyle(Ink.ink2).lineLimit(2)
            }
        }

        switch ctx.day.kind {
        case "session":
            // (A run in progress takes over the whole app at the root, so Today never needs a Resume button.)
            if let plan = recommended {
                PrimaryButton(title: "Start \(plan.label)", accessibility: "Start \(plan.label), \(plan.blocks.count) exercises") {
                    Task { await runner.start(plan) }
                }
            }
        case "done":
            Tally(count: ctx.day.sets ?? 0)
            Text("\(ctx.day.title ?? "Session") done · \(ctx.day.sets ?? 0) logged").font(.body).foregroundStyle(Ink.ink)
        case "rest", "no_program":
            Text(ctx.day.line ?? "").font(.body).foregroundStyle(Ink.ink)
            if !ctx.checkedIn {
                PrimaryButton(title: "How do you feel?") { showCheckIn = true }
            }
        default:
            EmptyView()
        }

        // Crown down: everything secondary, as rows with hairlines (no cards).
        VStack(alignment: .leading, spacing: 0) {
            if ctx.day.kind == "session", runner.run == nil {
                ForEach(plans.dropFirst()) { p in
                    row(p.label, detail: p.version == "planned" ? "As \(link.brand.coachFirst) planned it" : nil) {
                        Task { await runner.start(p) }
                    }
                }
            }
            if ctx.day.kind == "session" && !ctx.checkedIn {
                row("How do you feel?", detail: "3 taps") { showCheckIn = true }
            }
            NavigationLink {
                MessagesView()
            } label: {
                rowLabel(link.brand.coachFirst.isEmpty ? "Messages" : link.brand.coachFirst, detail: unreadLine(ctx))
            }
            .buttonStyle(.plain)
            Text(syncLine(ctx)).font(.footnote).foregroundStyle(Ink.ink2).padding(.vertical, 8)
        }
        .padding(.top, 8)
    }

    private func row(_ title: String, detail: String?, action: @escaping () -> Void) -> some View {
        Button(action: action) { rowLabel(title, detail: detail) }.buttonStyle(.plain)
    }

    private func rowLabel(_ title: String, detail: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.body).foregroundStyle(Ink.ink)
            if let detail { Text(detail).font(.footnote).foregroundStyle(Ink.ink2) }
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .overlay(alignment: .top) { Rectangle().fill(Ink.line).frame(height: 1) }
        .contentShape(Rectangle())
    }

    private func unreadLine(_ ctx: WatchContext) -> String {
        let coach = ctx.messages.filter { $0.from == "coach" }
        guard let last = coach.last else { return "No messages yet" }
        return last.body
    }

    /// When the phone last sent today's plan (from the context itself, so it's right after a relaunch too).
    private func syncLine(_ ctx: WatchContext) -> String {
        guard let at = Wire.iso.date(from: ctx.sentAt) else { return "Waiting for your iPhone" }
        return "Last synced \(Fmt.time(at))"
    }

    private var dateLine: String {
        let f = DateFormatter()
        f.setLocalizedDateFormatFromTemplate("EEE d MMM")
        return f.string(from: Date())
    }
}
