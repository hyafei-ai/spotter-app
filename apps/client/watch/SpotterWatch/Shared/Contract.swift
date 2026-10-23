// Contract.swift — the phone ↔ watch payloads, version 1.
// Mirrors packages/core/src/watch.ts exactly (field names and meaning). Change both together.
// NOT COMPILED OR RUN HERE: written against Apple's documented APIs; verify in Xcode.
//
// Wire format: every WatchConnectivity payload is ["v": 1, "json": "<JSON string>"]. One JSON string avoids
// property-list limits (no null in plists) and keeps both sides on the same parser.

import Foundation

let payloadVersion = 1

// MARK: - Blocks

struct StrengthSet: Codable, Hashable {
    var reps: Int?
    var loadKg: Double?
    var rpe: Double?
}

enum IntervalTarget: Codable, Hashable {
    case pace(secPerKm: Int)
    case watts(Int)
    case hrZone(Int)
    case rpe(Double)

    private enum CodingKeys: String, CodingKey { case kind, secPerKm, watts, zone, rpe }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "pace": self = .pace(secPerKm: try c.decode(Int.self, forKey: .secPerKm))
        case "watts": self = .watts(try c.decode(Int.self, forKey: .watts))
        case "hr_zone": self = .hrZone(try c.decode(Int.self, forKey: .zone))
        default: self = .rpe(try c.decode(Double.self, forKey: .rpe))
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .pace(let s): try c.encode("pace", forKey: .kind); try c.encode(s, forKey: .secPerKm)
        case .watts(let w): try c.encode("watts", forKey: .kind); try c.encode(w, forKey: .watts)
        case .hrZone(let z): try c.encode("hr_zone", forKey: .kind); try c.encode(z, forKey: .zone)
        case .rpe(let r): try c.encode("rpe", forKey: .kind); try c.encode(r, forKey: .rpe)
        }
    }
}

enum Block: Codable, Hashable {
    case strength(Strength)
    case interval(Interval)
    case station(Station)
    case timed(Timed)

    struct Strength: Codable, Hashable {
        var exerciseId: String
        var programExerciseId: String?
        var name: String
        var metric: String          // "weight_reps" | "bodyweight_reps"
        var sets: [StrengthSet]
        var restSec: Int
        var group: String?
        var trackRpe: Bool
    }
    struct Interval: Codable, Hashable {
        var exerciseId: String?
        var programExerciseId: String?
        var name: String
        var reps: Int
        var workSec: Int?
        var distanceM: Double?
        var restSec: Int
        var target: IntervalTarget?
    }
    struct Station: Codable, Hashable {
        var exerciseId: String?
        var programExerciseId: String?
        var name: String
        var distanceM: Double?
        var reps: Int?
        var loadKg: Double?
    }
    struct Timed: Codable, Hashable {
        var exerciseId: String?
        var programExerciseId: String?
        var name: String
        var seconds: Int
    }

    var name: String {
        switch self {
        case .strength(let b): return b.name
        case .interval(let b): return b.name
        case .station(let b): return b.name
        case .timed(let b): return b.name
        }
    }

    private enum K: String, CodingKey { case kind }

    init(from decoder: Decoder) throws {
        let kind = try decoder.container(keyedBy: K.self).decode(String.self, forKey: .kind)
        switch kind {
        case "strength": self = .strength(try Strength(from: decoder))
        case "interval": self = .interval(try Interval(from: decoder))
        case "station": self = .station(try Station(from: decoder))
        case "timed": self = .timed(try Timed(from: decoder))
        default: throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Unknown block kind \(kind)"))
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: K.self)
        switch self {
        case .strength(let b): try c.encode("strength", forKey: .kind); try b.encode(to: encoder)
        case .interval(let b): try c.encode("interval", forKey: .kind); try b.encode(to: encoder)
        case .station(let b): try c.encode("station", forKey: .kind); try b.encode(to: encoder)
        case .timed(let b): try c.encode("timed", forKey: .kind); try b.encode(to: encoder)
        }
    }
}

struct SessionPlan: Codable, Hashable, Identifiable {
    var v: Int
    var planId: String
    var programDayId: String
    var date: String
    var title: String
    var version: String         // "planned" | "lighter" | "recovery"
    var label: String
    var coachNote: String?
    var units: String           // "kg" | "lb"
    var incrementKg: Double
    var calibration: String?
    var blocks: [Block]
    /// [block index, set/rep index], in the order the steps are done.
    var order: [[Int]]
    var id: String { planId }
}

// MARK: - Brief, branding, context

struct WatchAction: Codable, Hashable {
    var kind: String            // "start" | "check_in" | "none"
    var version: String?
    var label: String?
}

struct WatchBrief: Codable, Hashable {
    var v: Int
    var date: String
    var tone: String
    var feel: String
    /// Two or three words for the complication ("Running tired").
    var glance: String?
    var strike: String?
    var reason: String?
    var action: WatchAction
}

struct Branding: Codable, Hashable {
    var appName: String
    var coachName: String
    var coachFirst: String
    var monogram: String
    var accent: String
    var accentInk: String
}

struct WatchMessage: Codable, Hashable, Identifiable {
    var id: String
    var from: String            // "coach" | "client"
    var body: String
    var sentAt: String
}

struct WatchDay: Codable, Hashable {
    var kind: String            // "session" | "done" | "rest" | "no_program"
    var title: String?
    var sets: Int?
    var line: String?
}

struct WatchContext: Codable, Hashable {
    var v: Int
    var sentAt: String
    var branding: Branding
    var day: WatchDay
    var brief: WatchBrief?
    var plans: [SessionPlan]
    var checkedIn: Bool
    var hrMax: Int?
    var shareHr: Bool
    var messages: [WatchMessage]
    var quickReplies: [String]
}

// MARK: - Watch → phone

struct HrRecovery: Codable, Hashable {
    var peak: Int
    var at60: Int?
    var at120: Int?
}

struct SetLog: Codable, Hashable {
    var b: Int
    var i: Int
    var reps: Int?
    var loadKg: Double?
    var rpe: Double?
    var at: String
}

struct IntervalLog: Codable, Hashable {
    var b: Int
    var i: Int
    var workSec: Double
    var distanceM: Double?
    var avgHr: Int?
    var maxHr: Int?
}

struct StationLog: Codable, Hashable {
    var b: Int
    var sec: Double
    var avgHr: Int?
    var maxHr: Int?
}

struct TimedLog: Codable, Hashable {
    var b: Int
    var sec: Double
}

struct HrSummary: Codable, Hashable {
    var avg: Int?
    var max: Int?
    var perMinute: [Int]
}

struct SessionResult: Codable, Hashable {
    var v: Int = payloadVersion
    var kind: String = "session"
    var resultId: String
    var planId: String
    var programDayId: String
    var date: String
    var title: String
    var version: String
    var startedAt: String
    var endedAt: String
    var ended: String           // "finished" | "ended_early"
    var sets: [SetLog]
    var intervals: [IntervalLog]
    var stations: [StationLog]
    var timed: [TimedLog]
    var hr: HrSummary?
    var hrRecovery: HrRecovery?
}

struct CheckIn: Codable, Hashable {
    var v: Int = payloadVersion
    var kind: String = "check_in"
    var id: String
    var date: String
    var energy: Int
    var soreness: Int
    var stress: Int
    var at: String
}

struct Reply: Codable, Hashable {
    var v: Int = payloadVersion
    var kind: String = "reply"
    var id: String
    var body: String
    var sentAt: String
}

// MARK: - Encoding helpers

enum Wire {
    /// Codable → ["v": 1, "json": String] for WatchConnectivity.
    static func pack<T: Encodable>(_ value: T) -> [String: Any]? {
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        guard let data = try? enc.encode(value), let json = String(data: data, encoding: .utf8) else { return nil }
        return ["v": payloadVersion, "json": json]
    }

    /// ["v": 1, "json": String] → Codable. Nil for a newer version (the phone app must be updated first).
    static func unpack<T: Decodable>(_ dict: [String: Any], as type: T.Type) -> T? {
        guard let v = dict["v"] as? Int, v <= payloadVersion,
              let json = dict["json"] as? String, let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static func stamp(_ date: Date = Date()) -> String { iso.string(from: date) }

    /// Foundation prints UUIDs in upper case; the contract uses lower case.
    static func newId() -> String { UUID().uuidString.lowercased() }

    static func localDay(_ date: Date = Date()) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}
