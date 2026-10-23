// AppGroup.swift — what the watch app shares with its complication extension (both run on the watch).
// NOT COMPILED OR RUN HERE.
//
// The phone and the watch don't share an app group (different devices). Branding and the brief reach the
// watch in the WatchConnectivity application context; the watch app writes them here so the complication can
// draw them, and reloads the complication's timeline.

import Foundation
import SwiftUI
#if canImport(WidgetKit)
import WidgetKit
#endif

enum AppGroup {
    /// Set at build time by the config plugin: "group.<tenant iOS bundle id>.watch".
    static var suiteName: String {
        (Bundle.main.object(forInfoDictionaryKey: "TenantAppGroup") as? String) ?? ""
    }
    static var defaults: UserDefaults? { UserDefaults(suiteName: suiteName) }

    private static let contextKey = "context.json"

    /// The last application context from the phone, as received.
    static func saveContext(_ json: String) {
        defaults?.set(json, forKey: contextKey)
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }

    static func loadContext() -> WatchContext? {
        guard let json = defaults?.string(forKey: contextKey), let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(WatchContext.self, from: data)
    }
}

/// The trainer's brand on the wrist. Build-time values (Info.plist keys written by the config plugin from the
/// tenant config) are the fallback; the phone's runtime branding wins once it has arrived, so a rebrand shows
/// without a reinstall. The installed name and icon are fixed at build time by Apple.
struct Brand: Equatable {
    var appName: String
    var coachName: String
    var coachFirst: String
    var monogram: String
    var accent: Color
    var accentInk: Color

    static var buildTime: Brand {
        let info = Bundle.main.infoDictionary ?? [:]
        let name = (info["CFBundleDisplayName"] as? String) ?? ""
        let coach = (info["TenantCoachName"] as? String) ?? ""
        return Brand(
            appName: name,
            coachName: coach,
            coachFirst: coach.split(separator: " ").first.map(String.init) ?? coach,
            monogram: (info["TenantMonogram"] as? String) ?? "",
            accent: Color("AccentColor"),
            accentInk: Color(hex: (info["TenantAccentInk"] as? String) ?? "#FFFFFF")
        )
    }

    static func from(_ b: Branding?) -> Brand {
        guard let b else { return buildTime }
        return Brand(appName: b.appName, coachName: b.coachName, coachFirst: b.coachFirst, monogram: b.monogram,
                     accent: Color(hex: b.accent), accentInk: Color(hex: b.accentInk))
    }
}

/// Art-direction tokens (docs/design/art-direction.md, dark mode; watchOS is always dark).
enum Ink {
    static let paper = Color(hex: "#171614")
    static let surface = Color(hex: "#211F1C")
    static let ink = Color(hex: "#F1ECE2")
    static let ink2 = Color(hex: "#A8A296")
    static let line = Color(hex: "#34312C")
    static let success = Color(hex: "#6FBF83")
    static let warning = Color(hex: "#E0B04A")
    static let error = Color(hex: "#F2867E")
}

extension Color {
    init(hex: String) {
        let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let n = UInt32(s, radix: 16) ?? 0
        self.init(red: Double((n >> 16) & 0xFF) / 255, green: Double((n >> 8) & 0xFF) / 255, blue: Double(n & 0xFF) / 255)
    }
}

/// Numbers in Barlow Condensed (bundled by the plugin), words in the system font; both follow Dynamic Type.
enum Fonts {
    static func figure(_ size: CGFloat, relativeTo style: Font.TextStyle = .largeTitle) -> Font {
        .custom("BarlowCondensed-Bold", size: size, relativeTo: style)
    }
    static let title = Font.system(.headline, design: .default).weight(.semibold)
    static let body = Font.system(.body)
    static let caption = Font.system(.footnote)
}
