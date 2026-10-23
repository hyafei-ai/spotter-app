// PhoneLink.swift — WatchConnectivity on the watch side.
// NOT COMPILED OR RUN HERE.
//
// Channels (docs/features/watch.md):
//  - phone → watch: updateApplicationContext with the WatchContext (latest wins; read on activation too, so a
//    cold launch has today's plan before anything else). Also a queued "start" request via transferUserInfo
//    when the client starts a session from the phone.
//  - watch → phone: transferUserInfo for every result, check-in and reply. Queued by the system, delivered in
//    order, survives either side sleeping or the app being killed. Never sendMessage for anything that must arrive.

import Foundation
import WatchConnectivity

@MainActor
final class PhoneLink: NSObject, ObservableObject {
    static let shared = PhoneLink()

    @Published private(set) var context: WatchContext?
    @Published private(set) var brand: Brand = .buildTime
    /// When the phone last sent a context (the "Last synced 07:02" row).
    @Published private(set) var lastSync: Date?
    /// Results, check-ins and replies the system hasn't handed to the phone yet.
    @Published private(set) var pending = 0
    /// A session the phone asked us to start (phone-started workout), by plan id.
    @Published var requestedPlanId: String?

    private override init() {
        super.init()
        if let saved = AppGroup.loadContext() { apply(saved) }
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: Outbound

    func send(_ result: SessionResult) { queue(result) }
    func send(_ checkIn: CheckIn) { queue(checkIn) }
    func send(_ reply: Reply) { queue(reply) }

    private func queue<T: Encodable>(_ value: T) {
        guard let payload = Wire.pack(value) else { return }
        WCSession.default.transferUserInfo(payload)
        refreshPending()
    }

    private func refreshPending() {
        pending = WCSession.default.outstandingUserInfoTransfers.count
    }

    // MARK: Inbound

    private func receive(context dict: [String: Any]) {
        guard let ctx = Wire.unpack(dict, as: WatchContext.self) else { return }
        if let json = dict["json"] as? String { AppGroup.saveContext(json) }
        apply(ctx)
        lastSync = Date()
    }

    private func apply(_ ctx: WatchContext) {
        context = ctx
        brand = Brand.from(ctx.branding)
    }

    private func receive(userInfo dict: [String: Any]) {
        // The phone's start request: {"v":1,"json":"{\"kind\":\"start\",\"planId\":\"…\"}"}
        struct Start: Decodable { var kind: String; var planId: String }
        if let start = Wire.unpack(dict, as: Start.self), start.kind == "start" { requestedPlanId = start.planId }
    }
}

extension PhoneLink: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        let latest = session.receivedApplicationContext
        Task { @MainActor in
            if !latest.isEmpty { self.receive(context: latest) }
            self.refreshPending()
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in self.receive(context: applicationContext) }
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        Task { @MainActor in self.receive(userInfo: userInfo) }
    }

    nonisolated func session(_ session: WCSession, didFinish userInfoTransfer: WCSessionUserInfoTransfer, error: Error?) {
        let payload = userInfoTransfer.userInfo
        Task { @MainActor in
            // A failed transfer is queued again; the phone ignores duplicates by id.
            if error != nil { WCSession.default.transferUserInfo(payload) }
            self.refreshPending()
        }
    }
}
