# Apple Watch app for the client: morning glance, the session, coach messages

Method: `anthropic-skills:app-ux-improvement`, as CLAUDE.md requires for a new feature area. Sections 1–10 were
written **before building**; sections 11–16 were added **after building**, from the screenshots of the web watch
preview and a review. Personas, walkthroughs and timings are design hypotheses, not research with real clients.

Engineering, the contract and the heart-rate design are in `docs/features/watch.md`.

**Status of what follows.** The watch app is SwiftUI written against Apple's documented APIs. It was **not compiled
or run here** (this container has no Swift toolchain or Xcode). Everything about how it looks was checked on the
web watch preview (`/watch-preview` in the client app), which draws the same screens with the same content and
hierarchy at 41, 45 and 49 mm.

---

## 1. Facts, assumptions, hypotheses

**Facts provided**
- The product owner has an existing watch app ("the reference": `hyafei-ai/hybrid-fitness`, `watch/HybridFitnessWatch`,
  about 9,300 lines of SwiftUI). They said that product's UX was confusing, and its heart rate is unreliable enough to
  block race use (`docs/WATCH_HR_BUG_BRIEF.md` in that repo).
- Spotter has two sides: the client and the coach, who owns the business. The watch is for the **client**, in the
  **coach's brand**. Every installed name, icon, complication and permission prompt is the trainer's, never Spotter's
  (product owner, Oct 2026).
- `docs/ux/physiology-ux.md` fixes three jobs on the wrist: morning glance, in session, coach messages.
- Any trainer style must work: strength, hybrid/Hyrox, CrossFit, endurance, general fitness.
- Today's program model (`packages/core/src/programs.ts`) is strength-shaped: exercises × sets, with `time` and
  `distance` metrics. Interval targets (pace, watts, HR zone) and Hyrox stations arrive with the multi-sport program
  model in the next phase.

**Assumptions**
- Most clients in the segment with an iPhone also wear an Apple Watch (stated as an assumption in physiology-ux.md).
- Between sets the client has 60–180 s, is standing, sweaty, maybe chalky, and looks at the wrist for 1–2 s at a
  time (art-direction.md, section 2).
- The client trains with the phone in a bag or locker at least some of the time; the gym may have no signal.

**Hypotheses to validate on real wrists**
- W-H1: a client logs a prescribed set on the watch in one tap, and adjusts reps with the crown in under 3 s.
- W-H2: the morning complication line ("Running tired · easier version") is enough for a client to start the easier
  version without opening the phone.
- W-H3: clients will leave the watch still for 2 minutes after the session for heart-rate recovery if the screen says
  why and how long.
- W-H4: coaches use heart-rate recovery as a trend for each client ("recovering faster than last month"), not as a
  single-session verdict.

---

## 2. The reference app: what each screen did, and what happens to it

Screens and features read from `watch/HybridFitnessWatch/*.swift` and the reference designs
`design/station-zero-app-v2/11–13 Watch *.html`.

| Reference screen / feature | What it did | Decision | Why |
|---|---|---|---|
| `ContentView` idle home | Status cluster (phone dot, ACWR pill, clock), "From iPhone" pending tile, Today hero, Freeform + History tiles, Hyrox sim entry, "Plan · History" crown reveal, More today, My workouts (top 6), beeps toggle, simulator demo button | **Redesigned** as **Today**: one feel line, one session, one primary action | Eight competing entries on a 45 mm screen; two labels for the same workout (their own design 11 says so). The client's job is "what do I do now", not "pick from a library". |
| Scaling level picker (full-screen) | Pick RX / Intermediate / Beginner before starting | **Replaced** by the coach's versions: planned · easier · recovery, recommended by the brief | Spotter already has the coach's easier version and the brief's recommendation; the client doesn't pick a level cold. |
| `WorkoutCountdownView` (3-2-1 GO) | Pre-start countdown with Cancel | **Cut** for strength; **kept as a 3 s lead-in** only before timed and interval work | A strength set starts when the client is ready; a countdown is a wait. Intervals do need a clean start. |
| `AthleteWorkoutView` / `PagedWorkoutView` | Movement, round pill, segment pips, timer + HR + zone, progress bar, next-up peek, DONE; paged controls | **Redesigned** as **Set**, **Interval**, **Station**, **Timed** screens (one per block kind) | One layout tried to be AMRAP, EMOM, for-time, segment and freeform at once. Spotter's blocks say what kind of work it is, so each screen shows only what that work needs. |
| `WorkoutControlsView` (pause / lock / end) | Three equal buttons; End one tap from losing the session | **Redesigned**: "…" opens Pause · End; End asks once and **always saves what was logged** | Their design 13 flagged End as one tap from data loss. |
| `AthleteRestTimerView` | Teal ring countdown, HR with arrow, up next, Skip rest | **Kept, redesigned** as **Rest**: big countdown, next set, HR; crown ±15 s; haptic at 10 s and 0 | Proven need; colour-only "teal mode" becomes a word ("Rest") plus the countdown. |
| `QuickRestTimerView` | Stand-alone rest timer | **Cut** | Rest comes from the coach's plan in the session; a free timer is a different app. |
| `LapTimerView` (coach circuit, partner names) | Coach-run group circuit: station, partner, big DONE | **Cut** (group/partner mode) · **kept** the big lap button inside **Station** | Group sessions with partners are a gym-floor coach feature; Spotter's watch is one client. The lap button idea is right for stations. |
| `HyroxSimulation` + `HyroxSimViews` (setup, GO, runner, transition, pause, summary, history) | Full Hyrox race sim: division picker, 8 runs + 8 stations, roxzone transitions, undo, per-segment HR and pace, crash-safe state, outbox | **Kept the engine**, **cut the setup**: the coach writes Hyrox stations as session blocks (`station` and `interval` kinds); the watch runs them with the same timing, undo window, crash-safe state and per-segment splits | Race structure and division loads belong to the coach's program, not a setup wizard on the wrist. We also don't ship a table of race weights we haven't sourced (no invented numbers). |
| `AthleteHRRecoveryView` | 60 s capture after a workout; HRR60 with "Excellent / Good / Average" category | **Kept and extended** to 60 s and 120 s; **category removed** | "Explain, don't score": no population categories. Shown as "Down 31 bpm in the first minute", and the coach sees the client's own trend. |
| `AthleteWorkoutCompleteView` | Total time, rounds, avg/max HR, kcal, mandatory RPE picker, enjoyment faces | **Redesigned** as **Done**: tally strike, sets logged, time, one line of HR recovery, "Sent to {coach}" or "Saved on your watch". Session RPE optional | Per-set RPE is already logged where the coach asked for it; a second mandatory RPE blocks finishing. Enjoyment faces: cut (the phone's finish screen has "How did it feel"). |
| `EffortGaugeView` (5-zone arc) | HR arc coloured by zone vs target | **Cut** the arc; HR zone shown as words only on intervals that target a zone ("Zone 3 · on target") | Arcs and rings are on the avoid-list; colour-only meaning. Zones use the client's own max, never 220 − age. |
| `TrainingLoadRingView` (ACWR) | Ring + "Danger Zone" | **Cut** from the watch | A ratio with "danger" on the wrist alarms without saying what to do. The brief already turns load into "Here's what to do". |
| `WorkoutHistoryView` | List of past watch workouts | **Deferred** (phone Train tab has history) | Looking back is a phone job. |
| Freeform workout (HR only) | Open-ended HR session | **Cut** | Apple's Workout app does this; Spotter's value is the coach's plan. |
| Countdown beeps toggle | Speaker on/off | **Cut** as a control; haptics follow the watch's own settings | One less thing; Apple's sound settings already apply. |
| `SZSplashView` (1.4 s splash) | Brand animation before anything | **Cut** | 1.4 s of nothing when the client needs the number now. |
| `TrainingLoad`, streak, ACWR complications | Streak count, ACWR value, next workout | **Redesigned**: today's session and feel line only | Streaks and ratios are on the avoid-list. |
| `WatchSessionManager` (WCSession) | Plan list, live state relay, LAP taps, HRR relay, outbox, history snapshot | **Kept the plumbing ideas**, rewritten small: plan by `updateApplicationContext`, results by `transferUserInfo`, `sendMessage` only when reachable and only for nice-to-have | The reference used `sendMessage` for things that must arrive. |
| `WatchHealthManager` (HKWorkoutSession) | Session, builder, watchdog with teardown/restart, backup HR query, pedometer pace | **Rewritten**: one store, one session lifecycle per workout, recovery on relaunch, no teardown-restart watchdog | See `docs/features/watch.md` for each bug-brief symptom and the change that addresses it. |
| `SharedDefaults` (app group) | Complication data | **Kept**: brand, brief and today's session in the watch's app group for the complication | — |
| Phone `WatchOnboardingScreen` | Feature list and three setup steps | **Redesigned** as Me → **Apple Watch** row + one sheet: status, one line on what it does, "Open the Watch app" | Status first ("Ready on your watch" / "Install it from the Watch app"), then help. |

---

## 3. The client's jobs on the wrist

- **Morning:** *When I wake up, I want to know if today is a normal day or an easier one, so I start the right
  session without opening my phone.* Emotional: *I want to feel my coach already thought about how I slept.*
- **In session:** *When I finish a set, I want to log it in one tap and know what's next and how long I rest, so I
  keep moving and my coach sees what I really did.* Also for intervals and Hyrox: *When I'm on a station, I want one
  big button for "done" and the right next thing, so I don't think mid-effort.*
- **Messages:** *When my coach writes, I want to read it and answer in a few words, without getting the phone out.*
- **After:** *When I finish, I want my coach to see how my body handled it (how fast my heart rate came down), so
  the next session fits.*

### Critical tasks

| # | Task | Frequency | Cost of failure | Type | Priority |
|---|---|---|---|---|---|
| WT1 | Log a set as prescribed (1 tap), or with changed reps / RPE (crown) | 15–30 × per session | Wrong log → wrong loads next time, distrust | Primary | 1 |
| WT2 | Know rest left and what's next | Every set | Rushed or long rests | Primary | 2 |
| WT3 | Start today's session in the recommended version | 3×/week | Overtraining or skipping | Primary | 3 |
| WT4 | Morning glance: feel line + one action | Daily | Misses the easier day | Primary | 4 |
| WT5 | Run an interval or station block with one button | Per conditioning session | Lost splits | Primary (conditioning) | 5 |
| WT6 | 3-tap check-in | Daily | Brief runs on less | Secondary | 6 |
| WT7 | Read and reply to the coach | A few × per week | Slower relationship | Secondary | 7 |
| WT8 | Heart-rate recovery after the session | Per session | Coach misses a recovery trend | Secondary | 8 |
| WT9 | Recover after a crash / dead battery / phone away | Rare | Lost session | Exception | 9 |

---

## 4. Flows: OLD vs NEW

**Start today's session**
- OLD: splash (1.4 s) → idle home → find Today hero among Freeform, History, Hyrox, My workouts → tap → level picker
  (if the workout has levels) → 3-2-1 countdown → workout. 4–5 decisions.
- NEW: open → **Today** shows "Running tired" + "Start Lower A · easier" → tap → **Set 1**. 1 tap. Other version:
  crown down → "As planned". *Removed:* splash, library, level picker, countdown. *Combined:* brief + start.

**Log a set**
- OLD (reference): the watch didn't log strength sets; it tracked segments with DONE and time.
- NEW: **Set** screen shows "80 kg × 8" → tap **Log set** → (only if the coach asks for RPE) **RPE**: crown to 8 →
  tap → **Rest** 1:59 → haptic at 0:10 and 0:00 → **Set 2**. Different reps: turn the crown first (reps change on the
  big number), then Log set. Different load: tap the load, crown, tap Log set.

**Hyrox / intervals**
- OLD: Hyrox setup (format, type, division) → GO → runner (run/station, transition with +10 s, undo) → summary.
- NEW: the coach's session contains `station` and `interval` blocks → Today → Start → **Station** "Sled push · 50 m ·
  102 kg" with elapsed time and one **Done** → **Interval** "Run 2 of 8 · 1 km" with pace → … Undo for 5 s after
  each Done. *Removed:* setup wizard. *Kept:* timing, undo window, crash-safe state, per-segment HR and splits.

**Finish**
- OLD: end → HRR 60 s (phone-computed) with category → complete screen with mandatory RPE + enjoyment.
- NEW: last set logged → **Finish** sheet "14 of 15 sets · 52 min · Finish" → **Recovery** (2 min, "Keep still.
  Measuring how fast your heart rate comes down", Skip) → **Done**: tally, "Down 31 bpm in the first minute", "Sent to
  Maya". Ending early: "…" → End → "End and save 9 sets?" → same path.

**Morning**
- OLD: complication with streak / ACWR; no brief.
- NEW: complication "Lower A · easier" (rectangular: feel line + session) → tap → Today. Notification at the
  client's reminder time: "Running tired today · Maya set an easier Lower A" with actions **Easier version** and
  **As planned** (each opens the watch straight into the session in that version).

**Check-in**
- NEW: Today → crown down → "How do you feel?" → **Energy** (crown 1–5, words) → tap → **Soreness** → tap →
  **Stress** → tap → back on Today with the brief updated by the phone when it next syncs ("Sent to your phone").

**Messages**
- NEW: Today → crown down → "Maya · 1 new" → **Message** (text, large) → **Reply** → quick replies (coach's
  language: "Done, felt good", "Can we talk later?", "On my way", "Thanks!") or **Dictate**. Sent replies go to the
  phone's queue and on to the coach.

---

## 5. Navigation on the watch, and where the phone parts go

One `NavigationStack`, Today at the root. In session, the session screens replace the stack (no back into Today
mid-set; "…" is the way out). Crown scrolls Today's secondary rows. Nothing is more than two levels deep.

Phone: **Me → Connections → Apple Watch** (status + help), next to the health app row, because it is a connection
like Apple Health, not a body feature. **Who sees what** gains one row: *Heart rate from watch sessions*. The web
build adds **Apple Watch preview** (`/watch-preview`), reachable from that row in demo builds only.

---

## 6. Screen specs (watch)

Rules for every screen: one primary action, bottom of the screen, full width, brand fill. The most important number
is Barlow Condensed at 40–64 pt. Secondary text ink2. No cards, hairlines only. Every state has words.

### W1 Today (root)
- **Purpose:** know how today looks and start.
- **Primary:** **Start {session} · {version}** (the brief's recommendation; "Start Lower A" when it says go).
  In progress: the app opens straight into the session (changed while building: no Resume button needed).
- **Shows:** coach monogram + date (top left, small; the system clock owns the top right) · feel line (display, 1–2 lines, the key word struck) · top reason
  (one line, ink2) · primary.
- **Crown down (secondary rows):** As planned / easier / recovery (the other versions) · How do you feel? (until
  today's check-in is done) · {Coach} (unread count) · Last synced 07:02.
- **Deferred:** all reasons, all to-dos, exercise list (the session itself shows them in order), history.
- **States:**
  - *Never synced (no phone yet):* "Open {App name} on your iPhone once to bring today's plan here." No button.
  - *Phone away / offline:* today's plan from the last sync; the Last synced row says when. Everything still works.
  - *No session today (rest day):* feel line, coach's rest-day line, primary **How do you feel?** if not checked in,
    else none.
  - *No program / paused / finished program:* "{Coach} hasn't set your next session yet." No button.
  - *Session done:* tally strike + "Lower A done · 15 sets" + HR recovery line; no primary.
  - *No brief yet (no data):* feel line "Check in to get today's brief"; primary still Start.
  - *Loading:* last known content; there is no spinner screen.

### W2 Check-in (3 steps)
- **Purpose:** energy, soreness, stress in 3 taps.
- **Primary:** **Next** (steps 1–2), **Save** (step 3).
- **Shows:** step "1 of 3", question ("Energy"), big number 1–5 with its word ("3 · OK"), crown changes it (detents,
  selection haptic).
- **Deferred:** sleep (from the watch via Health), note, symptoms, pain (phone).
- **States:** saved → "Sent to your phone" (or "Saved, sends when your iPhone is near"); already done today → row
  hidden from Today.

### W3 Set (strength)
- **Purpose:** do and log this set.
- **Primary:** **Log set** (logs what's shown; one tap when the client did what was prescribed).
- **Shows:** exercise name (title, 1 line, scales down) · "Set 2 of 3" · target **80 kg × 8** (display; reps
  focused) · "RPE 8" if prescribed · calibration line when loads were adjusted ("−2.5 kg: your cycle") · live HR
  small, top right, with the heart glyph and "bpm".
- **Crown:** changes the focused number (reps by 1, load by the coach's increment). Tap the other number to focus it.
- **Deferred:** previous-time numbers, swaps, notes (phone logger), form check.
- **States:** no HR → "—" with "HR off" in words on tap; superset → "A1 · then Push press"; bodyweight → reps only;
  time metric → see Timed; RPE asked → after Log set, **RPE** sheet (crown 6–10 in 0.5, words "8 · 2 left in the
  tank", **Save**, Skip).

### W4 Rest
- **Purpose:** rest the coach's time, know what's next.
- **Primary:** **Skip rest**.
- **Shows:** "Rest" · countdown **1:42** (display) · "Next: Back squat · set 3 · 80 kg × 8" · HR.
- **Crown:** ±15 s. **Haptics:** `.notification` at 0:10, `.success` at 0:00 then the next set appears.
- **States:** rest done → next Set screen (no extra tap); backgrounded → the end time is absolute, so it's right when
  the client raises the wrist.

### W5 Interval
- **Purpose:** do the work part, rest the rest part.
- **Primary:** time-based work: none while it runs (auto-advances; **Pause** in "…"); distance-based work: **Done**.
- **Shows:** "Rep 3 of 6" · phase word "Work" / "Rest" (and different layout, not only colour) · countdown or
  distance target **1 km** · target "4:50 /km" or "Zone 3" or "RPE 7" · live pace on runs · HR.
- **Haptics:** 3-2-1 clicks before each phase change, `.start` on work, `.stop` on rest.
- **States:** no GPS / pace yet → "Pace in a moment"; target none → just the timer.

### W6 Station (Hyrox-style)
- **Purpose:** do this station and mark it done.
- **Primary:** **Done** (large, bottom 40 % of the screen, like the reference's lap button).
- **Shows:** station name ("Sled push") · "50 m · 102 kg" or "100 reps · 6 kg" · elapsed **3:12** · "Station 2 of 8" ·
  HR.
- **After Done:** 5 s **Undo** pill (reference's undo window) and the next block.
- **States:** paused (in "…") → "Paused · 3:12" and **Resume**.

### W7 Timed
- **Purpose:** hold / work for a set time.
- **Primary:** **Start** (then counts down; **Done early** in place of Start).
- **Shows:** name, countdown **0:45**, "Set 1 of 3".

### W8 Finish sheet / End sheet
- **Purpose:** close the session without losing anything.
- **Primary:** **Finish** (all done) or **End and save** (early, says the count: "9 of 15 sets logged").
- **Secondary:** Keep going.

### W9 Recovery (heart rate)
- **Purpose:** measure how fast HR comes down, for the coach.
- **Primary:** **Skip**. (The measurement runs by itself for 2 minutes.)
- **Shows:** "Keep still" · countdown **1:12** · "Peak 168 · now 141" · one line of why ("Shows {coach} how you're
  recovering").
- **States:** no HR (permission off, loose strap) → "No heart rate. Saved without it." and Done.

### W10 Done
- **Purpose:** confirm the session reached the coach.
- **Primary:** **Done** (back to Today).
- **Shows:** tally strike (the only celebration) · "Lower A · 15 sets · 52 min" · "Down 31 bpm in the first minute" ·
  status words: "Sent to Maya" / "Saved on your watch · sends when your iPhone is near".

### W11 Messages / Message / Reply
- **Purpose:** read the coach's last messages and reply.
- **Primary:** on a message, **Reply**; on Reply, the first quick reply is pre-focused, plus **Dictate**.
- **Shows:** coach monogram + name, message text at body size (Dynamic Type), time.
- **Deferred:** voice notes, images, threads with history beyond the last 5.
- **States:** no messages → "{Coach} hasn't written yet"; sent → "Sent" (or "Sends when your iPhone is near").

### Complication and notification
| Family | Content | Tap |
|---|---|---|
| `accessoryRectangular` | Line 1: feel line ("Running tired"); line 2: "Lower A · easier" or "Rest day" or "Lower A · done" | Today |
| `accessoryCircular` | Coach monogram; below it one word: "Train", "Rest", "Done" | Today |
| `accessoryInline` | "Lower A · easier" | Today |
| `accessoryCorner` | Monogram, label "Lower A" | Today |
Notification (category `brief.morning`): title = feel line, body = "{Coach} set an easier {session}" or "{session} as
planned", actions **Easier version**, **As planned**. No streaks, rings, numbers that need explaining.

---

## 7. Crown, haptics, glanceability, accessibility

**Crown:** always changes the one number in focus (reps, load, RPE, check-in value, rest ±15 s). Never scrolls a
screen that has a focused number; on Today and Messages it scrolls.

**Haptics (one meaning each):** `.success` set logged / station done · `.notification` rest ending in 10 s ·
`.start` / `.stop` interval phase changes · `.click` crown detents and 3-2-1 · `.failure` couldn't save. Nothing else.

**Glanceability rules (mid-set, under 2 s):**
1. One thing per screen; the number the client needs is the biggest thing on it (40–64 pt condensed numerals).
2. The primary action is always in the same place (bottom, full width).
3. Words over colour: "Work" / "Rest" / "Paused" are always written; colour only repeats them.
4. No text under 15 pt except the clock; at most 3 lines of text besides the number.
5. Live HR is small and top right: useful, never the hero (it's not the job mid-set).
6. Always-on (wrist down): the same layout dimmed, seconds hidden, HR hidden.

**Accessibility:** every control has a VoiceOver label that says the action and the number ("Log set: 80 kilograms,
8 reps"); the steppable numbers expose `accessibilityAdjustableAction` (VoiceOver swipe up/down = crown); text uses
`Font.custom(_, size:, relativeTo:)` so it follows Dynamic Type, with `minimumScaleFactor` only on names; contrast:
brand on charcoal is lightened until it passes 4.5:1 (same rule as the phone's dark mode); Reduce Motion draws the
strike at once.

---

## 8. Branding: the trainer's app on the wrist

The watch is fully white-labelled, at two times:

**Build time (per tenant, with the phone app):** the watch target's display name is `tenant.appName`; its bundle id is
the tenant's iOS id + `.watchkitapp` (the complication extension adds `.complication`); the icon set is generated from
the tenant's icon at every watchOS size; the accent colour is the tenant's brand, lightened for the watch's dark
background and baked into the asset catalog; the complication's display name and description, every permission
prompt and the HealthKit workout's brand name use the tenant's name. Building tenant X with
`scripts/tenant-build.mjs` produces X's phone app with X's watch app inside.

**Run time:** colours, coach name, monogram and the brief arrive from the phone in the application context and are
written to the watch's app group for the complication, so a rebrand shows without reinstalling (the installed name
and icon need a new build: Apple fixes them at build time).

**No Spotter on the wrist:** no user-visible string, asset, notification or HealthKit name says Spotter, Station Zero
or HybridFitness. `scripts/check-watch-whitelabel.mjs` checks the Swift sources and the generated plists for every
demo tenant and fails if one does.

**Art direction mapped to the watch** (`docs/design/art-direction.md`; watchOS is always dark):

| Token (phone dark) | Watch |
|---|---|
| paper `#171614` | background |
| surface `#211F1C` | pressed rows, sheets |
| ink `#F1ECE2` / ink2 `#A8A296` | text |
| line `#34312C` | hairlines between rows |
| brand (tenant, lightened to ≥ 4.5:1 on paper) | primary button fill, the strike, crown focus ring, monogram |
| brandInk | label on the primary button |
| success / warning / error (dark) | "Sent", "Sends later", "Couldn't save" — always with the words |
| Barlow Condensed 700 | numbers (load, reps, timers, HR) |
| Source Sans 3 / SF Compact | words |

The chalk strike: the feel line's key word on Today, and the tally on Done. Nowhere else.

---

## 9. Edge cases (before building)

| Trigger | What the watch knows | What the client sees | Recovery |
|---|---|---|---|
| Phone never paired with the app | No context | W1 never-synced state | Opens the phone app once |
| Phone in the locker | Last context | Today as of last sync; "Last synced 07:02" | Results queue (`transferUserInfo`), deliver later |
| Watch app killed mid-session | Persisted session state + HealthKit's recovered workout | Same set, same rest end time | `handleActiveWorkoutRecovery` reattaches |
| Battery dies mid-session | Persisted state up to the last set | On relaunch: straight back into the same set (End and save in "…") | Same |
| Plan changed by the coach mid-session | New context arrives | Keeps the started plan; Today shows the new one after | Session holds its plan copy |
| Two results for the same session | Same `resultId` | — | Phone ignores duplicates |
| HR permission off | No samples | "—" and "Heart rate is off · turn on in Settings › Health" once | Session still logs |
| Session started on the phone | Phone calls `startWatchApp` | The watch wakes into the same session | — |
| Logged a set by mistake | The set | "Undo" for 5 s on Rest | Undo removes it |

---

## 10. Design decisions log (before building)

| Decision | Alternatives | Why |
|---|---|---|
| One screen per block kind | One adaptive workout screen (reference) | Each kind needs different numbers; one adaptive screen was the reference's confusion |
| Log = prescribed values, crown to change | Enter reps every set | One tap for the common case (art-direction: "a set logs in a single tap") |
| No HR categories | Excellent/Good/Average (reference) | Explain, don't score; no population norms |
| Plan via application context, results via user info | sendMessage for everything (reference) | Delivery guarantees match what must arrive |
| Hyrox as coach-written blocks | On-watch setup wizard with division loads | Coach owns the program; no unsourced weights |
| HR recovery 60 + 120 s | 60 s only (reference) | A second reading after the first minute, asked for by the product owner; the coach sees both as the client's own trend, never against a norm |

---

## 11. What was built (after building)

| Area | Where |
|---|---|
| watchOS app: Today, check-in, Set / RPE / Rest / Interval / Station / Timed, pause and end, recovery, done, messages and reply, morning notification | `apps/client/watch/SpotterWatch/*.swift` |
| Complication (rectangular, circular, inline, corner) | `apps/client/watch/SpotterWatch/Complication/Complication.swift` |
| Phone: Me → Connections → **Apple Watch** (status, one line, Start on your watch); web/demo opens the preview | `apps/client/src/watch/WatchRow.tsx` |
| Phone: Who sees what → **Heart rate from watch sessions** | `apps/client/app/sharing.tsx`, `src/watch/store.ts` |
| Coach: client detail → **Watch sessions** (latest recovery, the client's own first-minute trend; only when shared) | `apps/coach/src/watch/WatchSection.tsx` |
| Web **Apple Watch preview**: every screen at 41/45/49 mm, both demo brands (tenant switcher), strength and the MOCK conditioning session, and a **Try it** watch with a crown | `apps/client/app/watch-preview.tsx`, `src/watch/preview/WatchScreens.tsx` |

Changed while building, from looking at the screenshots:
- The system clock sits top right on watchOS; the monogram (Today) and live HR (session screens) crowded it. The
  monogram moved left of the date; HR moved to the detail line under the title (`StepHeader` in Swift, `Head` in
  the preview).
- The complication's rectangular line truncated the feel line ("You're running tired to…"). The contract gained a
  short `glance` ("Running tired", "One thing to watch", "Good to go").
- The circular complication said "Lift" on every session day, wrong for a conditioning day: now "Train".
- "Undo last" read as a caption: it now has an icon and a 32 pt target.
- The preview showed impossible states (interval "2 of 1" on the easier version, a 4-minute 40 m carry, "End and save
  9 of 9"); fixed. Who sees what's "never sees" line contradicted the new heart-rate row; reworded.

## 12. Screenshots

All screens were captured and looked at: phone 390×844 and web 1280 wide, light and dark (`/watch-preview`, Me,
Who sees what, the coach's client detail). The watch is always dark; light/dark changes only the page around it.
Zero console errors on every page visited. A selection is in `docs/ux/watch/`:

| File | Shows |
|---|---|
| `light-390-preview-top.png`, `dark-390-preview-top.png` | Preview header, brand/size/session switchers, Try it on Today (Maya Reyes Strength) |
| `light-390-preview-nsb-top.png` | Same in North Shore Barbell's brand (teal accent, SO monogram) at 49 mm |
| `light-390-preview-45mm-03.png` | Notification, complications, Set |
| `light-390-preview-45mm-05.png` | Rest, Interval |
| `light-390-preview-45mm-08.png` | Recovery, Done (sent), Done (phone away) |
| `light-390-preview-41mm-session.png` | 41 mm: Today crown-down rows and the check-in |
| `light-390-tryit-rest.png` | Try it after logging set 1 (49 mm): Rest 2:30, next set |
| `dark-390-preview-nsb-conditioning-04.png`, `dark-1280-preview-nsb-conditioning-02.png` | MOCK conditioning: interval with pace target, station with Undo, timed hold |
| `light-1280-preview-45mm-01.png` | Web width: the Morning row |
| `light-390-me.png`, `dark-390-me.png` | Me → Apple Watch row |
| `light-390-sharing-s1.png`, `dark-390-sharing-s1.png` | Who sees what: the new heart-rate row |
| `light-390-coach-watch-section.png`, `dark-390-coach-watch-section.png` | Coach: Watch sessions on Jordan's detail |

What the preview can't show: real watchOS chrome (navigation bar, Always On dimming), the crown's feel, haptics,
SF Compact (the preview uses Source Sans), Dynamic Type sizes.

## 13. Cognitive walkthrough: a client mid-set, sweaty, one glance

Synthetic walkthrough on the preview and the Swift layouts; a hypothesis until tried on a wrist.

| Moment | What they need | What they see | Hesitation? | Fix / status |
|---|---|---|---|---|
| Racked the bar, raise wrist | Did it log? What now? | Rest, **2:28** at 64 pt, "Next: Back Squat · set 2 · 72.5 kg × 8" | None | — |
| Rest ends | Know without looking | Haptic at 0:10, success at 0:00; Set 2 appears | Might miss the 0:10 tap | Device test |
| Set 2, did 7 not 8 | Change reps fast | "8 reps" underlined in brand = focused; turn the crown once | Will they know the crown changes it? | Underline marks focus; a first-use hint is **not built** (15) |
| Tap Log set | One tap | Success haptic; RPE asked (the coach tracks RPE on squats) | "Another screen?" | Only where the coach asked; Skip is there |
| Hyrox station, gasping | Find Done | Done fills the bottom of the screen | None | — |
| Hit Done twice by mistake | Undo | "Undo last" for 5 s | Small target while moving | 32 pt now; device test |
| Phone in the locker | Will it save? | Done: "Saved on your watch · sends when your iPhone is near" (icon + words) | None | — |
| Wants to stop early | Not lose sets | "…" → End session → "End and save 9 of 13?" | "…" is small, top left | System toolbar button; check on device |
| After finish | Why stand still? | "Keep still · 1:12 · Shows Maya how you're recovering", Skip | May walk away | Skip keeps what was measured |

## 14. Heuristic issues remaining (severity 0–4)

| # | Heuristic | Issue | Where | Sev |
|---|---|---|---|---|
| H1 | Visibility | Live pace on run intervals (in the spec) isn't shown yet; only the target pace | Interval | 2 |
| H2 | Recognition | No first-use hint that the crown changes the focused number | Set | 2 |
| H3 | Error prevention | Undo is 5 s and fairly small for a moving athlete | Station, Rest | 2 |
| H4 | Visibility | The phone's morning reminder doesn't yet use the `brief.morning` category | Notification | 2 |
| H5 | Consistency | Preview words in Source Sans; the watch uses SF Compact | Preview | 1 |
| H6 | Flexibility | Session RPE isn't asked on the watch | Done | 1 |
| H7 | Help | "Target zone 4" without what that means in bpm for this client | Interval | 1 |
| H8 | Visibility | The preview's clock and date are fixed sample values | Preview | 1 |
| H9 | Minimalism | Today's crown-down list truncates the last message | Today | 1 |
| H10 | Accessibility | VoiceOver and Dynamic Type specified in code, unverified on a device | All | 2 |

No Critical or High (3–4) issues in what could be verified here. Everything about the real watch is unverified and is
the device checklist in `docs/features/watch.md`.

## 15. Self-critique: the 10 worst remaining problems

1. **None of it has run on a watch.** Highest risk: the HealthKit lifecycle under real background conditions.
2. **Live pace on runs is missing** (H1), which matters most for hybrid / Hyrox clients.
3. **Crown discoverability** (H2): add a one-time "Turn the crown to change" line.
4. **The notification half-exists** (H4): watch side done; the phone reminder must set the category and feel line.
5. **Coach sees watch summaries only in the demo**: the real pull of `session_watch_summaries` is missing (RLS is tested).
6. **Hyrox stations come only from MOCK data** until the multi-sport program model ships.
7. **Undo window** (H3) is short and its target small.
8. **The preview duplicates the Swift layouts by hand** and can drift; a shared screen-copy source would keep them honest.
9. **Watch check-ins don't carry the shared brief text** to the coach (only the read).
10. **Demo tenants' bundle ids contain "spotter"** (not user-visible; flagged by the check); real tenants need their own.

## 16. Scorecard (1–5)

| Criterion | Reference app | New | What would raise it |
|---|---|---|---|
| Most important thing findable in ~3 s | 2 | 5 | — |
| One primary action per screen | 2 | 5 | — |
| Glanceable mid-set (< 2 s) | 2 | 4 | Device test at arm's length; live pace |
| Task speed (log a set / start today) | 2 | 5 | — |
| Error prevention and recovery | 2 | 4 | Bigger, longer undo |
| Learnability (crown) | 2 | 3 | First-use crown hint |
| Any trainer style | 3 (Hyrox) | 4 | Multi-sport program model |
| Coach value | 1 | 4 | Real coach pull, months of trend |
| White-label | 1 | 5 | — |
| Accessibility | 2 | 3 | Verified on device |
| HR reliability (by design) | 1 | 4 | Proven by the device checklist |
| **Overall** | **1.8** | **4.2** | |
