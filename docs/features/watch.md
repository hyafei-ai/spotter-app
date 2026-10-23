# Apple Watch app (client): architecture, contract, heart-rate reliability, white-label

The client's watch app does three jobs: the **morning glance** (complication, notification, 3-tap check-in),
the **session** (the coach's plan as blocks, logged with the crown, rest timer with haptics, live heart rate,
offline), and **coach messages** (read, quick reply, dictation). After a session it measures **heart-rate
recovery**, which the coach sees when the client shares it. UX record: `docs/ux/watch.md`.

It is a redesign of the product owner's existing watch app (`hyafei-ai/hybrid-fitness`, the "reference"), keeping
its proven pieces (WatchConnectivity plumbing, HealthKit workout session, Hyrox and interval timing, HR recovery)
and rewriting the UI and the heart-rate lifecycle.

> **Status: the Swift and Objective-C code was not compiled or run here.** This container has no Swift toolchain,
> Xcode or Apple device. It is written against Apple's documented APIs (watchOS 10, iOS 17) and kept small. What
> *was* run is listed under "Verified".

## Map

| Piece | Where |
|---|---|
| Contract (blocks, brief, branding, context, result, check-in, reply), size bounds, result → session mapping | `packages/core/src/watch.ts`, tests `packages/core/test/watch.test.ts` |
| MOCK demo content (conditioning session, HR numbers, coach transport) | `packages/core/src/demo/watch.ts` |
| Sync mutations `session.watch`, `watch.share.set` | `packages/core/src/schemas.ts` |
| Table + RLS + handler | `packages/db/supabase/migrations/20261026010001_watch.sql`, tests `tests/93_watch.test.sql` |
| watchOS app (SwiftUI) | `apps/client/watch/SpotterWatch/` |
| Complication (WidgetKit extension) | `apps/client/watch/SpotterWatch/Complication/` |
| iPhone native module (WCSession, startWatchApp, mirroring) | `apps/client/plugins/watch/SpotterWatchModule.m` |
| Expo config plugin (targets, plists, icons, colours) | `apps/client/plugins/withSpotterWatch.js`, `plugins/watch/*` |
| Phone bridge | `apps/client/src/watch/` (`context.ts` builds what the watch shows, `WatchSync.tsx` sends and receives, `inbound.ts` stores, `WatchRow.tsx` is Me → Apple Watch) |
| Web watch preview | `apps/client/app/watch-preview.tsx`, `src/watch/preview/WatchScreens.tsx` |
| Per-tenant build | `scripts/tenant-build.mjs` (watch step), `scripts/make-tenant-icons.py --watch`, `scripts/check-watch-whitelabel.mjs`, `apps/client/eas.json` profile `production-watch` |

## Architecture

```
iPhone (React Native)                                     Apple Watch (SwiftUI, watchOS 10)
──────────────────────                                     ─────────────────────────────────
useWatchContext()  ── same plan/brief/versions as Today
   │  boundWatchContext (≤ 48 KB)
   ▼
SpotterWatch.updateContext ── WCSession.updateApplicationContext ──▶ PhoneLink → AppGroup (complication)
                                                                     │
Me → Apple Watch → "Start on your watch"                              ▼
SpotterWatch.startOnWatch ── transferUserInfo {start, planId} ──▶   TodayView → SessionRunner
                          └─ HKHealthStore.startWatchApp ───────▶   AppDelegate.handle(workoutConfiguration)
                                                                     │ WorkoutController (HKWorkoutSession,
                                                                     │  HKLiveWorkoutBuilder, mirroring)
◀── workoutSessionMirroringStartHandler (live HR, iOS 17) ──────────┘
◀── transferUserInfo {result | check_in | reply} ───────────────── PhoneLink.send
SpotterWatch inbox (persisted) → drain() → handleInbound
   → session.start / set.log / session.finish / session.watch (sync queue) → completed sessions
   → daily_check.submit   → message.send
```

Why our own native module and not `react-native-watch-connectivity` (the reference's choice): that package covers
WCSession only. The HR design needs `HKHealthStore.startWatchApp(with:)` and workout mirroring, and a module the
plugin adds only to watch builds leaves `package.json`, the lockfile and the web export untouched. The reference's
patch to that package (a nil-safe user-info error) isn't needed: our module persists inbound payloads itself.

### Channels

| What | Channel | Why |
|---|---|---|
| Today (plan versions, brief, branding, messages) | `updateApplicationContext` | Latest wins; delivered when the watch app next runs; read again on activation (`receivedApplicationContext`) so a cold launch has the plan before anything else. |
| Start this session (phone-started) | `transferUserInfo` + `startWatchApp` | Queued, and the HealthKit call wakes the watch app even asleep (the reference relied on `sendMessage`, which needs the watch reachable). |
| Session result, check-in, reply | `transferUserInfo` | Queued by the system in order; survives either side sleeping or being killed; re-queued on a transfer error. |
| Live HR on the phone | Workout mirroring (iOS 17) | Apple's path for a phone view of a watch workout. |
| `sendMessage` | Not used | Nothing that must arrive depends on reachability. |

Every payload is `{"v": 1, "json": "<JSON>"}`: one JSON string, so property-list limits (no null) don't apply and
both sides use the same parser. A side that sees a newer `v` ignores it and asks for an update.

## The contract (`packages/core/src/watch.ts`, v1)

- **`WatchSessionPlan`**: `planId` (`programDayId:date:version`), title, version (planned / lighter / recovery),
  units and plate increment, the cycle-calibration line when loads were adjusted, `blocks`, and `order`
  (`[block, set]` pairs; supersets alternate exactly as the phone logger's `performanceOrder`).
- **Blocks**:
  - `strength` `{exerciseId, programExerciseId, name, metric, sets: {reps, loadKg|null, rpe|null}[], restSec, group, trackRpe}`
  - `interval` `{name, reps, workSec|distanceM, restSec, target: pace|watts|hr_zone|rpe|null}`
  - `station` `{name, distanceM|reps, loadKg|null}` (Hyrox-style)
  - `timed` `{name, seconds}`
- **Built from today's program day** by `watchPlanFromSession`, using the same plan Today shows: the coach's easier
  version (`lighterPlan`), the recovery day when the coach wrote one, and cycle calibration (`calibratedLoad`, only
  on the planned version, never stacked on the easier one, same rule as the phone logger).
- **Strength-only programs today.** The program model has exercises × sets with `weight_reps`, `bodyweight_reps`,
  `time` and `distance` metrics, so a day maps to `strength` blocks, plus `timed` (a single hold) or `interval`
  (several timed or distance sets). Interval targets and stations arrive with the **multi-sport program model (next
  phase)**; the contract already carries them, `sequentialOrder` orders such blocks, and the demo's MOCK "Hybrid
  engine" session exercises every kind. Blocks without a program exercise behind them are kept as splits, never
  turned into invented sets.
- **`WatchBrief`**: tone, the feel line, the word the strike goes under, the strongest reason (one line), one
  action (start a version · check in · none).
- **`WatchBranding`**: app name, coach name and first name, monogram, accent (tenant brand lightened to 4.5:1 on the
  watch background, the phone's dark-mode rule) and the label colour on it.
- **`WatchContext`**: the above plus the day kind (session / done / rest / no program), whether today's check-in is
  done, the client's own highest observed HR (for zone targets; never 220 − age), the HR sharing switch, the last 5
  messages and 4 quick replies. `boundWatchContext` keeps it under 48 KB: drops older messages, then coach notes,
  then the non-recommended versions.
- **`WatchResult`** (watch → phone): per-set reps / load / RPE, interval splits, station splits, timed holds, HR
  summary (average, max, one average per minute, capped at 3 h) and HR recovery (`peak`, HR at 60 s and 120 s).
  Missing keys read as null (Swift omits nil keys). Ids are lower-cased (Foundation prints UUIDs in upper case).
- **`watchResultToSession`** maps a result into the phone's completed-session shape: logged sets with ids derived
  deterministically from the result id (a re-delivered result maps to the same ids and the server's upserts do
  nothing), the version as the session's variant, and the summary for `session.watch`. So watch sessions count for
  load, progress, calibration, patterns and the coach's views like any session.
- **`WatchCheckIn`** goes through the daily check (`daily_check.submit`), with sleep filled from the watch via
  Apple Health when present. **`WatchReply`** is a normal `message.send`.

## Heart rate: the reliability design against the bug brief

The reference's brief (`docs/WATCH_HR_BUG_BRIEF.md` there) lists five symptoms and seven hypotheses. Reading its
`WatchHealthManager.swift`, the common thread is **overlapping or orphaned workout sessions**: every start tore down
the previous session with `session.end()` and kicked `endCollection`/`finishWorkout` off asynchronously, then created
a new session immediately; a 2-second watchdog did the same teardown-and-recreate whenever samples were late; view
`onAppear`, scene activation and the Hyrox runner could all call "ensure session started". Our design:

| Symptom (bug brief) | Likely cause in the reference | Design change here |
|---|---|---|
| 1. Cold launch / fresh install shows "—" forever | Session armed before authorization finished; orphaned session from a killed run (H1); watchdog restarting during the optical sensor's warm-up (H5) | `start()` awaits `requestAuthorization` first; the session is created once per workout with `prepare()` → `startActivity` → `beginCollection`; no restart watchdog. Relaunch with a running workout goes through `handleActiveWorkoutRecovery` → `recoverActiveWorkoutSession`: reattach if a saved run exists, else end it cleanly before any new start (H1). After 30 s with no sample the screen says so in words (H2: read permission can't be queried); after 60 s an anchored HR query is the display fallback, the session is never recreated. |
| 2. "Worked at 12 pm, broken at 6 pm" | The noon session wasn't fully finished (async `finishWorkout` not awaited when the app was backgrounded), leaving a session HealthKit still held | `end()` waits for the `.ended` state, then `endCollection` and `finishWorkout`, before returning; the workout session's background runtime keeps the app alive until that's done. Recovery on relaunch ends any orphan. |
| 3. Workout #3 has no HR | A new `HKWorkoutSession` created while the previous one was still ending; watchOS allows one at a time and the new one silently delivers nothing | All start / end / recover calls go through one serial lane on the main actor (H3); a start is a no-op while a session is starting or running; the next start can't begin until the previous `finishWorkout` returned. One long session per training session, never pause/resume across workouts. |
| 4. Phone-started workout never reaches a sleeping watch | `sendMessage` needs the watch reachable (H6) | The phone queues `{start, planId}` with `transferUserInfo` and calls `HKHealthStore.startWatchApp(with:)`, which launches the watch app; the session starts in `handle(_ workoutConfiguration:)` as Apple requires. |
| 5. Race mode flicker ("—" → number → "—" → reconnecting) | Watchdog restarts zeroing state; the Hyrox runner re-arming the session on view appear / re-entry; a reconnecting state machine shown to the athlete | Views never start sessions (only `SessionRunner.start`); no restarts, so no state cycling; the display keeps the last reading and shows "—" only when it is older than 15 s; no "reconnecting" state at all. |
| H4 (data source order) | `enableCollection` before assigning the data source | Data source assigned before delegates and start, as in Apple's documentation; distance collection enabled on the data source for non-running sessions (stations, intervals), HR is collected by default. |
| H7 (async flag reset race) | `hrSessionGaveUp` reset via `DispatchQueue.main.async` | No such flag; all state lives on the main actor. |

Activity types: strength and holds → `traditionalStrengthTraining`; runs with a pace target only → `running`; mixed
(Hyrox-style, intervals, stations) → `highIntensityIntervalTraining` (`watchActivityType` in core, mirrored in
`SessionRunner.activity(for:)`). The saved workout's brand name (`HKMetadataKeyWorkoutBrandName`) is the trainer's
app name.

**Heart-rate recovery.** On Finish (or End and save), the peak is the highest HR in the session's last minute; the
workout session keeps running for 2 minutes (screen: "Keep still"), then ends. HR at 60 s and 120 s is the reading
nearest each, within ±10 s (`hrRecoveryFrom` in core, mirrored in Swift). Shown as "Down 31 bpm in the first minute,
50 after two": no categories, no population norms. The coach sees it (and its trend over sessions) only while the
client's **Heart rate from watch sessions** switch is on (Who sees what; `session_watch_summaries` RLS). Raw samples
never leave Apple Health.

## White-label: the trainer's app on the wrist

**Build time, per tenant.** `scripts/tenant-build.mjs --kind build --platform ios` now runs a watch step before
`eas build`: renders the tenant's icon at every watchOS size (`make-tenant-icons.py --watch <slug>`, sizes in
`plugins/watch/watch-icon-sizes.json`), runs the white-label check, and builds with the `production-watch` EAS profile
(`SPOTTER_WATCH=1`, so the plugin also runs on the EAS worker). The plugin then writes, from the tenant config:

| Surface | Value |
|---|---|
| Watch app display name (`CFBundleDisplayName`) | `tenant.appName`; `CFBundleName` = `tenant.shortName` |
| Bundle ids | `<tenant iOS id>.watchkitapp`, complication `<…>.watchkitapp.complication`; app group `group.<tenant iOS id>.watch` |
| App icon | the tenant's icon at all 17 watchOS slots (`AppIcon.appiconset`) |
| Accent / tint | `AccentColor` from the tenant brand, lightened for the dark watch (`plugins/watch/brandTokens.js`, checked against core's `watchBranding` in tests) |
| Permission prompts | "Maya Reyes Strength reads your heart rate during sessions so Maya Reyes can see how you're recovering." |
| Complication name / picker | `configurationDisplayName` = the app name |
| HealthKit workout | brand name = the app name |
| Build-time brand for the Swift code | Info.plist keys `TenantCoachName`, `TenantMonogram`, `TenantAccentInk`, `TenantAppGroup` |
| EAS credentials | `extra.eas.build.experimental.ios.appExtensions` lists both targets so EAS can provision them |

**Run time.** Colours, coach name, monogram and the brief arrive in the application context; the watch app writes
them to the app group for the complication. A rebrand (or a trainer code in the shared app) shows on the wrist
without a reinstall; the installed name and icon change only with a new build (Apple fixes them at build time).

**No Spotter on the wrist.** `node scripts/check-watch-whitelabel.mjs [--generated apps/client/ios/SpotterWatch]`
fails on "Spotter", "Station Zero" or "HybridFitness" in any Swift string literal, generated plist or entitlement,
any bundle-id suffix the plugin adds, and (with `--generated`) everything `expo prebuild` wrote. It passed for both
demo tenants and on the real prebuild output, and fails when a planted "Spotter" string is added (checked). It
reports, without failing, that the **demo** tenants' own iPhone bundle ids are `com.spotter.*`: Apple requires the
watch ids to start with the phone's id, and bundle ids aren't user-visible; real tenants get their own ids. Internal
identifiers (the `SpotterWatch` source folder, the `SpotterWatch` native module name) are never shown to anyone.

## Verified here vs not

**Verified (run in this environment)**
- Core contract: 22 tests (`packages/core/test/watch.test.ts`): plan mapping incl. supersets and calibration, brief,
  branding (and that the plugin's JS colours equal core's), size bounds, parsing (versions, upper-case ids, missing
  nil keys), result → session (idempotent ids, sync-schema validity), MOCK multi-sport splits, HR recovery maths.
- SQL: `93_watch.test.sql` (client writes; own coach reads only while shared; another tenant's client can't attach a
  summary; "Only you" hides past rows; cascade on session delete).
- `expo prebuild -p ios` on Linux with `SPOTTER_WATCH=1` for both demo tenants: the generated `project.pbxproj` has
  the iPhone app, `Watch` (watchOS app, 11 Swift files) and `Complication` (app extension, 3 files) targets, the embed
  phases (watch app in `$(CONTENTS_FOLDER_PATH)/Watch`, complication in the watch app's PlugIns), every object
  reference resolves, no build file is shared between targets, it round-trips through the `xcode` parser, the
  plists parse, and the names / icons / colours are each tenant's.
- Without `SPOTTER_WATCH`, the config's plugin list is unchanged; the web export builds; `pnpm install
  --frozen-lockfile` is unaffected (no dependency added).
- The web watch preview: every screen at 41/45/49 mm in both demo brands, zero console errors (`docs/ux/watch.md`).

**Not verified (needs Xcode and devices)**
- That the Swift, the Objective-C module and the generated targets compile and sign (EAS credentials for two extra
  bundle ids, the app group, HealthKit on the watch).
- All HealthKit behaviour (recovery, startWatchApp, mirroring, background runtime during rest), WatchConnectivity
  delivery, the complication on a real face, the notification category actions, Dynamic Type and VoiceOver on watchOS.
- The watchOS icon slot list against the Xcode version used to build (newer Xcode also accepts a single 1024 px icon).
- The `itms-watchs://` link that opens the iPhone's Watch app.

## Device test checklist

Run each on a real iPhone + Apple Watch (watchOS 10+), with the watch app's console logs captured.

1. **Cold launch HR.** Force-quit the watch app (and once after a fresh install, granting permissions). Start a
   session from Today. Expect HR within 30 s; if not, the words "No heart rate yet…" at 30 s, never a restart.
2. **Three workouts in a day.** Finish (incl. recovery) three sessions back to back, then a fourth after 2+ hours with
   the app backgrounded. Expect HR within 30 s every time; check Health shows four separate workouts with the
   trainer's app name.
3. **Phone-started with the watch asleep.** Watch on the wrist, screen off (and once on the charger). Me → Apple Watch
   → Start on your watch. Expect the watch app to open on Set 1 with HR.
4. **Offline session, then sync.** Phone in airplane mode or out of range; run a whole session including a check-in
   and a reply. Done says "Saved on your watch…". Bring the phone back: the session appears in Train → History
   (counted in load and progress), the check-in on Today, the reply in the coach thread; nothing is duplicated after
   relaunching both apps.
5. **Race-mode flicker.** Run the conditioning (station / interval) session for 20+ minutes, raising and lowering the
   wrist, opening other apps and coming back. HR never cycles through "—" while the strap is snug.
6. **Crash recovery.** Kill the watch app mid-rest (Xcode, or restart the watch). Relaunch: same set, same rest end
   time, HR continues; or the orphaned workout is ended and Today shows again if there was no saved run.
7. **Rebrand.** Change the trainer's colour in the coach app; the watch's accent and complication update after the
   phone syncs, without reinstalling.
8. **White-label.** Settings › Health › Data Access, the complication picker, notifications and the app grid show only
   the trainer's name and icon.

## Gaps and next steps

- The coach app reads watch summaries from the demo transport only (`spotter.watch.<tenant>`); real builds need a
  pull of `session_watch_summaries` for the coach's client view.
- A check-in from the watch shares the read but not the brief text (the phone builds the shared brief on its own
  check screen); the coach sees the read's factors for that day.
- Interval targets and Hyrox stations need the multi-sport program model to come from coaches' programs.
- The morning notification's category (`brief.morning`) is registered on the watch; the phone's reminder needs to set
  that category and the feel line as its title when the client has a watch.
- Session RPE ("how did it feel") isn't asked on the watch; per-set RPE is, where the coach asks for it.
