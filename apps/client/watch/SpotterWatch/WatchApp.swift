// WatchApp.swift — entry point, app delegate (workout recovery, phone-started workouts) and the morning
// brief notification. NOT COMPILED OR RUN HERE.

import HealthKit
import SwiftUI
import UserNotifications
import WatchKit

@main
struct WatchApp: App {
    @WKApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @StateObject private var link = PhoneLink.shared
    @StateObject private var runner = SessionRunner.shared
    @StateObject private var workout = WorkoutController.shared

    var body: some Scene {
        WindowGroup {
            NavigationStack {
                // A run in progress takes the whole app, so raising the wrist mid-session lands on the set.
                if runner.run != nil {
                    SessionView()
                } else {
                    TodayView()
                }
            }
            .tint(link.brand.accent)
            .environmentObject(link)
            .environmentObject(runner)
            .environmentObject(workout)
            .onChange(of: link.requestedPlanId) { _, planId in
                // The phone started this session (it called startWatchApp and queued the plan id).
                guard let planId, let plan = link.context?.plans.first(where: { $0.planId == planId }) else { return }
                link.requestedPlanId = nil
                Task { await runner.start(plan) }
            }
        }
        WKNotificationScene(controller: BriefNotificationController.self, category: BriefNotification.category)
    }
}

final class AppDelegate: NSObject, WKApplicationDelegate, UNUserNotificationCenterDelegate {
    func applicationDidFinishLaunching() {
        Task { @MainActor in
            PhoneLink.shared.activate()
            _ = await WorkoutController.shared.requestAuthorization()
        }
        UNUserNotificationCenter.current().delegate = self
        BriefNotification.registerCategory()
    }

    /// The system relaunched us with a workout still running (crash, kill, reboot): reattach, or end the orphan
    /// cleanly so it can never block the next session (bug brief H1).
    func handleActiveWorkoutRecovery() {
        Task { @MainActor in
            await WorkoutController.shared.recover(keep: { SessionRunner.shared.hasLiveRun })
        }
    }

    /// The iPhone called HKHealthStore.startWatchApp(with:): this wakes the watch app even when it was asleep
    /// (bug brief H6), and Apple expects the workout session to start here.
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        Task { @MainActor in
            let link = PhoneLink.shared
            let plan = link.context?.plans.first(where: { $0.planId == link.requestedPlanId }) ?? link.context?.plans.first
            if let plan {
                link.requestedPlanId = nil
                await SessionRunner.shared.start(plan)
            } else {
                await WorkoutController.shared.startFromPhone(workoutConfiguration)
            }
        }
    }

    /// Easier version / As planned from the morning notification: open straight into that version.
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let version: String
        switch response.actionIdentifier {
        case BriefNotification.easier: version = "lighter"
        case BriefNotification.planned: version = "planned"
        default: return
        }
        await MainActor.run {
            if let plan = PhoneLink.shared.context?.plans.first(where: { $0.version == version }) {
                Task { await SessionRunner.shared.start(plan) }
            }
        }
    }
}

/// The phone's morning reminder uses this category; iOS shows it on the watch with these two actions.
enum BriefNotification {
    static let category = "brief.morning"
    static let easier = "brief.easier"
    static let planned = "brief.planned"

    static func registerCategory() {
        let easier = UNNotificationAction(identifier: easier, title: "Easier version", options: [.foreground])
        let planned = UNNotificationAction(identifier: planned, title: "As planned", options: [.foreground])
        let cat = UNNotificationCategory(identifier: category, actions: [easier, planned], intentIdentifiers: [])
        UNUserNotificationCenter.current().setNotificationCategories([cat])
    }
}

/// Long look: the feel line big, the session line, the trainer's monogram. No numbers to explain.
final class BriefNotificationController: WKUserNotificationHostingController<BriefNotificationView> {
    private var title = ""
    private var bodyText = ""

    override var body: BriefNotificationView { BriefNotificationView(title: title, bodyText: bodyText, brand: PhoneLink.shared.brand) }

    override func didReceive(_ notification: UNNotification) {
        title = notification.request.content.title
        bodyText = notification.request.content.body
    }
}

struct BriefNotificationView: View {
    let title: String
    let bodyText: String
    let brand: Brand

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(brand.monogram).font(Fonts.figure(14)).foregroundStyle(brand.accentInk)
                .frame(width: 24, height: 24).background(Circle().fill(brand.accent))
            Text(title).font(Fonts.figure(26)).foregroundStyle(Ink.ink)
            Text(bodyText).font(.body).foregroundStyle(Ink.ink2)
        }
    }
}
