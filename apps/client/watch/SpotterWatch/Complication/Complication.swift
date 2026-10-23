// Complication.swift — the watch-face complication (WidgetKit extension target, built by the config plugin).
// NOT COMPILED OR RUN HERE.
//
// Shows today's session and the brief's feel line only. No streaks, rings or ratios (art-direction avoid-list).
// Reads the context the watch app saved in the shared app group; refreshed whenever the phone sends a new one.

import SwiftUI
import WidgetKit

struct TodayEntry: TimelineEntry {
    let date: Date
    let feel: String
    let session: String
    let word: String        // "Train" / "Rest" / "Done"
    let monogram: String
    let accent: Color
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry { entry() }
    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) { completion(entry()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        // Refresh after midnight so yesterday's session never shows as today's.
        let tomorrow = Calendar.current.startOfDay(for: Date().addingTimeInterval(86_400))
        completion(Timeline(entries: [entry()], policy: .after(tomorrow)))
    }

    private func entry() -> TodayEntry {
        let ctx = AppGroup.loadContext()
        let brand = Brand.from(ctx?.branding)
        let plan = ctx?.plans.first
        let today = ctx?.day.kind ?? "none"
        let session: String = {
            switch today {
            case "session": return plan?.label ?? ""
            case "done": return "\(ctx?.day.title ?? "") · done"
            case "rest": return "Rest day"
            default: return brand.appName
            }
        }()
        let word = today == "session" ? "Train" : today == "done" ? "Done" : today == "rest" ? "Rest" : ""
        return TodayEntry(date: Date(), feel: ctx?.brief?.glance ?? ctx?.brief?.feel ?? "", session: session, word: word, monogram: brand.monogram, accent: brand.accent)
    }
}

struct TodayComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TodayEntry

    var body: some View {
        switch family {
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 1) {
                Text(entry.feel.isEmpty ? entry.session : entry.feel).font(.headline).lineLimit(1).widgetAccentable()
                if !entry.feel.isEmpty { Text(entry.session).font(.caption).lineLimit(1) }
            }
            .accessibilityElement(children: .combine)
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 0) {
                    Text(entry.monogram).font(Fonts.figure(16, relativeTo: .caption)).widgetAccentable()
                    if !entry.word.isEmpty { Text(entry.word).font(.system(size: 10)) }
                }
            }
            .accessibilityLabel("\(entry.session). \(entry.feel)")
        case .accessoryInline:
            Text(entry.session)
        case .accessoryCorner:
            Text(entry.monogram).font(Fonts.figure(18, relativeTo: .caption)).widgetAccentable()
                .widgetLabel { Text(entry.session) }
        default:
            Text(entry.session)
        }
    }
}

@main
struct TodayComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "today", provider: TodayProvider()) { entry in
            TodayComplicationView(entry: entry)
                .containerBackground(for: .widget) { Color.clear }
        }
        // White-label: the complication picker shows the trainer's app name, never ours.
        .configurationDisplayName(Brand.buildTime.appName)
        .description("Today’s session and how you’re doing.")
        .supportedFamilies([.accessoryRectangular, .accessoryCircular, .accessoryInline, .accessoryCorner])
    }
}
