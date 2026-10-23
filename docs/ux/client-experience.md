# Client app experience: Today · Train · Body · {Coach} · Me

Method: `anthropic-skills:app-ux-improvement`, as required by CLAUDE.md. Brief: `docs/ux/client-ia-audit.md`. This is
the record for the client rebuild (Oct 2026): written before building (sections 1–4), then completed after
building with screenshots, a timed walkthrough and a review (sections 5–9). Personas and timings are design
hypotheses checked by walking the web build, not research with real clients.

## 1. The user's job and the critical task

**Job (client):** *When I open my coach's app, I want to know how to train today and start, so I train right for
how my body is today without thinking about it.* Second job: *see how my body is responding over time, and keep
control of what my coach sees.*

**Critical task:** open the app → understand today → start the session. Target: understood in ~3 s, started in
1 tap from Today.

**What people should be able to say about it:** "It tells me how to train today from my sleep, watch and how I
feel, and my coach sees what I choose to share."

## 2. Current flow vs proposed flow

### Navigation
| Before | After | Why |
|---|---|---|
| Today · History · {Coach} · Me | **Today · Train · Body · {Coach} · Me** | Body features were buried in Me (audit H1). Five tabs is the platform limit; each answers one question: *what now / how is training going / how is my body / talk to my coach / my account*. |

### What moved, merged, was removed or deferred
| Item | Before | After |
|---|---|---|
| Daily brief | A bordered block of text: tag, feel, "Here's why" list, "Here's what to do" list, calibration, caption, then two secondary buttons | **Moved up and redesigned.** Feel line as display type with the chalk-strike under the key word; reasons as **tappable chips** that open their detail; **one** recommended action as the primary button labelled with the version |
| Easier / recovery buttons | Two secondary buttons inside the brief, competing with "Start" | **Combined** into the primary button (recommended version) plus one quiet "Other versions" that opens a sheet |
| Exercise list on Today | Full list of rows | **Compressed** to one "Today's session" block (title, count, names); the full sheet is the logger |
| History tab | Sessions + imported workouts, with a "Progress" row styled like a session | **Train tab**: this week's program at the top, then Progress (wins incl. masters weekly wins, trend, consistency drawn), mobility entry, then History (logged + imported together) |
| Progress screen | Linked from Me and History | Still exists (detail), opened from Train's Progress block; wins gain **Share** |
| Daily check, Your cycle, Fuel check, Pain, Progress, Health app rows in Me | Me (junk drawer) | Body tab cards (cycle, fuel, pain, recovery, mobility); Progress → Train; Health app stays in Me as a **connection** (account item) |
| Recovery detail | Didn't exist (numbers only appeared inside the brief) | **New** `/recovery`: 14-night sleep bars with own baseline, HRV sparkline with baseline band, resting HR, each with one plain line and tap-to-explain |
| Mobility detail | Only on Today (rest/done) | **New** `/mobility`: minutes this week, logs, quick log (Today keeps its rest-day prompt) |
| Sharing | Four switches on four screens (daily check settings, cycle, fuel, each pain log), plus prose in each | **One "Who sees what" screen** (`/sharing`) with one row per data type; every scattered toggle keeps working but links there |
| "Track your cycle" toggle in Daily check settings | Second cycle switch | **Removed.** Your cycle owns cycle on/off; Daily check settings links there |
| Daily check sleep | "Add last night's sleep" button even when the watch had it | **Prefilled** from the wearable day with its source ("From Apple Watch via Apple Health") |
| Nutrition "0 kcal of 2,650" | Shown when the food app hasn't written today yet | Shows the health total with source, or "MyMacros hasn't written today's food to Apple Health yet" |
| Pain screen | No way to log from it | Primary **Log pain** button |
| Terms (HRV, energy availability, cycle phase) | Unexplained | Tap-to-explain line the first time, "What's this?" after |
| Wins | Text rows | **Share a win** card in the trainer's brand |
| Me | 15+ rows mixing account and body | Account only: profile, plan & billing, health connections, notifications, privacy (+ Who sees what), waiver, invite a friend, export/delete/sign out; demo controls stay at the bottom in demo builds |

### Deferred (not in this build)
- Weekly training as stacked bars of logged vs imported *load* (Train shows sessions per week; load needs a
  sourced load chart design). 
- Per-day sharing history ("what did my coach see on Tuesday").
- Tenant tab-label options for the new Train/Body tabs (the brand editor is in the coach app, out of scope;
  Train/Body labels are fixed for now).

## 3. Flows

**Critical: open → understand → start**
1. Open → Today. Top: date and session name (small), then the feel line big ("You're running ~~tired~~ today").
2. Eye drops to 2–3 chips ("Sleep 5.6 h", "HRV under usual", "Luteal phase"). Optional: tap a chip → its detail.
3. Thumb on the pinned primary: **Start Lower A · easier version** → logger. 1 tap.

**Change version:** Today → "Other versions" → sheet (Easier · Planned · Recovery, each with one line) → Start.

**Who sees what:** Body header link (or Me → Privacy, or any sharing toggle's "Who sees what" link) → one list →
flip a switch. Immediate, offline-safe.

**Share a win:** Train → Progress → a win → Share → preview card in the trainer's brand → Share (native share
sheet) / Copy text + Download image (web).

## 4. Screen specs

### Today
- **Purpose:** decide how to train today and start.
- **Primary action:** the session button labelled with the recommended version ("Start Lower A · easier version",
  or "Start Lower A" when the brief says go).
- **Secondary:** "Other versions" (sheet); "How do you feel?" check-in row while today's check isn't done.
- **Deferred:** full reason text and numbers (chip → detail), to-dos beyond two, calibration detail (cycle screen),
  exercise prescriptions (logger).
- **States:** loading (skeleton); not checked in (brief from overnight data + "Add how you feel" row); no data
  (check-in prompt as the content, still the Start button); rest day (feel line, coach's rest line, mobility, no
  primary); session done (tally, "See the log"); in progress (Resume); no program / paused / finished (coach
  message empty state); error: the brief never blocks the session (no brief → Start still works).

### Train
- **Purpose:** see how training is going and what's coming this week.
- **Primary action:** none pinned (a reading screen); the biggest tap target is the Progress block.
- **Sections:** This week (days with done/today/upcoming), Progress (latest win + Share, consistency bars,
  strongest trend line; "See all progress"), Mobility (minutes this week → `/mobility`), History list.
- **Deferred:** per-exercise charts (Progress screen), session sheets (history detail).
- **States:** loading skeleton; empty (no sessions: one sentence + Go to Today); no program (week hidden, line
  instead); imported-only history (still listed, labelled Imported / Sample).

### Body
- **Purpose:** see how the body is responding over time.
- **Primary action:** none (reading screen); every card opens its detail.
- **Cards:** Recovery (sleep bars with own baseline, HRV sparkline with baseline band, resting HR line),
  Cycle (ring with today marked + calibration line; hidden unless tracking; otherwise a one-line "Track your
  cycle" row at the bottom), Fuel (this week vs need; hidden when nutrition is off), Pain (active niggles or
  "Nothing hurting"), Mobility (minutes this week, 7 bars).
- **Header link:** Who sees what.
- **States:** no health app: Recovery card says "Connect Apple Health to see sleep and recovery" with Connect
  (Me → Health); sparse data (fewer than 7 nights): chart plus "Your usual needs a week of nights"; loading:
  skeleton cards.

### Who sees what
- **Purpose:** know and control exactly what {coach} sees.
- **Primary action:** the toggles (no footer button).
- **Rows:** Daily read · Cycle (phase + summary) · Fuel check level · Pain logs · Imported workouts · Mobility,
  each "{Coach} sees …" / "Only you" + switch; then "{Coach} never sees: period dates, food logs, raw heart data,
  body fat, symptoms".
- **States:** cycle not tracking → row says "Not tracking" and links to Your cycle; nutrition off → fuel row hidden;
  offline → change saved on the phone, sync banner shows; error → banner "Couldn't save on this phone".

### Me
- **Purpose:** account.
- **Primary action:** none.
- **Rows:** profile (name, email, units), Plan & billing, Invite a friend, Health app connection, Notifications,
  Daily check reminder, Privacy (Who sees what, privacy policy, waiver), Export / Delete / Sign out; demo controls.
- **States:** billing problem banner; health denied; signed-out handled by auth.

### Recovery (new detail), Mobility (new detail), Share a win (new)
- Recovery: purpose "is my body recovering?"; no primary; three blocks, each chart + plain line + tap-to-explain;
  empty: connect line.
- Mobility: purpose "log and see mobility"; primary: the one-tap log (MobilityLog); week bars; list of logs.
- Share a win: purpose "show a win"; primary **Share**; card preview in the trainer's brand; win picker (this
  week's wins); health-data wins carry a line saying so; web: Download image (if supported) / Copy text.

---

## 5. What was built

| Area | Where |
|---|---|
| Tabs Today · Train · Body · {Coach} · Me | `apps/client/app/(tabs)/_layout.tsx`; `/history` redirects to `/train` |
| Today: feel line with the chalk-strike, reason chips → detail, one recommended action, "Other versions" sheet | `app/(tabs)/today.tsx`, `src/today/BriefHero.tsx`, `src/today/versions.ts` |
| Train: this week, Progress (wins incl. `masters.ts` weekly wins, sessions-per-week bars, trend), mobility, history | `app/(tabs)/train.tsx`, `src/wins/useWins.ts` |
| Body: Recovery, Cycle (ring), Fuel (week vs need), Pain, Mobility cards; header link Who sees what | `app/(tabs)/body.tsx`, `src/body/*` |
| New detail screens | `app/recovery.tsx`, `app/mobility.tsx`, `app/sharing.tsx` (Who sees what), `app/share-win.tsx` |
| Me: account only | `app/(tabs)/me.tsx`, `src/MeRows.tsx` |
| Chart primitives (bars with own-baseline line, sparkline with usual band, cycle ring, meter, static strike) | `packages/ui/src/components/MiniCharts.tsx` (react-native-svg, already a dependency). Each takes a plain-sentence `label` for screen readers; meaning is always also in words |
| Display helpers (sleep/HRV/resting-HR reads, ring segments, weekly minutes, share card text) | `packages/core/src/bodyview.ts`, tests in `packages/core/test/bodyview.test.ts` |
| Mobility sharing switch (the one kind that had none) | `mobility.share.set` mutation (`schemas.ts`), migration `20261025020001_client_sharing.sql`, tests `92_client_sharing.test.sql` |
| Imported-workout and pain sharing switches | `useHealthImports.shareImported` (re-sends imports so `share_with_coach` updates), `useInjury.shareDefault` + `setShareAll` |
| Fixes from the audit | Daily check prefills sleep from the watch with its source; Nutrition and the Today due row say "Waiting for MyMacros" instead of "0 kcal"; Pain has a primary **Log pain**; Daily check settings lost the duplicate cycle switch (links to Your cycle); tap-to-explain (`src/explain/Explain.tsx`) for HRV, energy availability, cycle phase, resting HR and "your usual"; plain line before the numbers on the fuel check and recovery |
| Share a win | Card in the trainer's brand (light paper always, brand band, monogram or logo, "Coached by {coach}"). Native: system share sheet with the card's text. Web: **Download image** (PNG drawn with the canvas API, `src/wins/cardImage.web.ts`, no new dependency), system share when the browser has one, else **Copy text**. Wins from watch data or naming a cycle phase are marked and never pre-selected |

Verified on the web build: the PNG downloads (1080×1350) and the copied text is
"New best on Dead hang (48 s of 60). Coached by Maya Reyes · Maya Reyes Strength". **Not verified:** the native share
sheet (no device here) and any image on native: `react-native-view-shot` isn't installed, so native shares text only.

## 6. Screenshots (390×844, light and dark)

The client app is phone-only, so there is no 1280-wide view to capture (the web dashboard did not change). All 36 screens/states in both schemes were captured and looked at (sweep script in the session scratchpad,
`cx/sweep.js`); a selection is kept in `docs/ux/client-experience/`. Fixed after looking:

- The brief's to-dos could mention fuel when the fuel reason wasn't one of the three chips. Now only to-dos whose reason is
  shown (or general ones) appear.
- Tab labels were clipped at the bottom on the web build (pre-existing): the web tab bar is taller now.
- The week strip showed "Missed" on a week the streak called steady (it counted only this phone's sessions). It now
  counts the same sessions Progress does and says "Not done", never "Missed".
- Progress drew the consistency bars against the 8-week planned total, so the bars were tiny; and its trend bars
  overflowed the screen with a "first → last" caption that contradicted the trend sentence. Now: bars against the
  weekly plan, the trend as a sparkline, "best X kg".
- Phase bests ("Strongest ovulation-week Back Squat") name a cycle phase: now treated as health data on the share
  card (never pre-selected, labelled "mentions your cycle").
- Fuel and Pain disagreed in the demo (fuel saw a knee niggle, Pain said "Nothing hurting"): the demo now seeds the
  same MOCK pain logs.
- Rest day repeated the coach's walk line; removed. Pain card led with counts; now "Left knee pain, ongoing" with the
  counts as the caption. Empty mobility chart drew empty ticks; now a sentence. Switch thumbs on Who sees what were
  invisible in dark mode when off; now ink.

## 7. Timed first-time-client walkthrough (open → understand today → start)

Measured on the web build with Playwright (`cx/flow6.js`), plus a reading-time estimate for a person:

| Step | Before (audit build) | After |
|---|---|---|
| App open to the answer visible | Brief below a check-in card; feel line at 20 pt inside a text block | Feel line is the first thing under the date, 40 pt display: visible ~1.0 s after navigation |
| Understand why | Read 3 "Here's why" lines + 3 "Here's what to do" lines + calibration + caption (~12–15 s) | 3 chips, 2–3 words each (~2–3 s); tap one for the detail |
| Start the right session | Two competing actions: pinned "Start Lower A" (the planned one) and an "Easier version" button inside the brief, below the fold | One pinned primary, **Start Lower A · easier version**: 1 tap, logger open in 0.36 s |
| Total | ~15–20 s, 1 tap plus a scroll to find the easier version | **~5 s, 1 tap** |

Can the walker say what it's for? Today reads "You're running tired today · HRV under usual · Resting HR up · Short
night · Start Lower A · easier version": *it tells me how to train today from my watch and my coach's plan.*

## 8. Cognitive walkthrough (first-time client)

| Step | What they try | What they see / think | OK? |
|---|---|---|---|
| Opens the app | Find today's plan | "Fri, Oct 23 · Lower A", "You're running tired today" with the word *tired* struck | Yes |
| Wonders why | Taps "HRV under usual" | Recovery: sleep bars against their usual, HRV with a usual band, "What's HRV?" open the first time | Yes |
| Wants the normal session | Looks below Start | "Other versions" → sheet: planned / easier (Suggested) / recovery when the coach wrote one | Yes |
| Checks in | "Add how you feel" row | Sleep already filled "From Apple Watch via Apple Health" | Yes |
| Wants to see progress | Train tab | This week, then the week's win with **Share**, sessions per week, the trend | Yes |
| Wonders what the coach sees | Body → "Who sees what" | One list, each with "{Coach} sees" or "Only you", a switch, and what's never seen | Yes |
| Turns cycle on | Body → "Track your cycle" or Your cycle | One place; Daily check settings link there | Yes |
| Something hurts | Body → Pain | Primary **Log pain**, regions first | Yes |
| Logs food in MyMacros | Today's due row / Nutrition | "Waiting for today's food from MyMacros", not "0 kcal" | Yes |
| Shares a win | Train → Share | Their coach's brand, the win, "Coached by Maya Reyes"; Share / Download image / Copy text | Yes |

## 9. Heuristic issues remaining (severity 0–4)

| # | Heuristic | Issue | Sev |
|---|---|---|---|
| R1 | Flexibility | Native share sends text only (no image) until an image library is added | 2 |
| R2 | Consistency | Switches outside Who sees what still use the surface thumb, faint in dark mode (app-wide component) | 2 |
| R3 | Visibility | Recovery's "connect your health app" empty state can't be seen in the demo (always sample data); untested visually | 2 |
| R4 | Match with real world | The cycle ring's segments aren't labelled on the ring (the phase is named beside it) | 1 |
| R5 | Minimalism | Today's session block + due list make the page scroll on a session day; the primary is pinned so it's never lost | 1 |
| R6 | Recognition | Progress win titles truncate at two lines in the list (full text on the share screen) | 1 |
| R7 | Consistency | Train and Body tab names are fixed; the brand editor's tab-label options (coach app) don't cover them yet | 1 |
| R8 | Visibility | The daily-read switch is a default for future check-ins; already-shared reads stay shared (said on screen) | 1 |
| R9 | Help | Only five terms have tap-to-explain; "estimated max" and "RPE" don't yet | 1 |
| R10 | Error prevention | The pain chip can be the 4th reason and drop off Today (max 3 chips); it's on Body | 1 |

No Critical or High issues remain from the screenshot review.

### Self-critique: the 10 worst remaining problems
1. Native share has no image (R1). The card is the word-of-mouth loop; text alone is weaker.
2. Dark-mode switch thumbs elsewhere (R2).
3. The coach app doesn't read mobility at all yet, so the new mobility switch is enforced by RLS but not visible in
   the demo coach app.
4. Demo data still mixes sources (fuel's 14 days, Jordan's 16 weeks, this phone's two sessions); real builds won't, but the
   demo can feel stitched together in places (for example "8 weeks in a row" with 1 session logged on this phone this week).
5. The cycle ring is decorative beyond "today is here" (R4).
6. Recovery empty state unverified visually (R3).
7. Today scrolls on session days (R5).
8. Win copy comes from core and is sometimes clunky on a poster ("New best on Dead hang (48 s of 60)").
9. Five terms explained; others not (R9).
10. Tab labels for Train/Body not brandable (R7).

## 10. Scorecard (1–5)

| Criterion | Before | After |
|---|---|---|
| Most important thing findable in ~3 s | 2 | 5 |
| One primary action per screen | 2 | 5 |
| Information architecture (things where people look) | 2 | 4 |
| Plain language, numbers one tap deeper | 3 | 4 |
| Data drawn, not described | 1 | 4 |
| Privacy clarity (who sees what) | 2 | 5 |
| Visual craft (art direction, light and dark) | 3 | 4 |
| Word-of-mouth (share a win) | 1 | 4 |
| **Overall** | **2.0** | **4.4** |
