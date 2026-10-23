# Daily brief, wearables, injury load and progress beyond PRs

Serves the client job in `docs/jtbd.md`: *train around body variance and share the read without extra effort*. The physiology layer is described in `docs/physiology.md`.

- **(1) Trains around variance.** The daily brief adds HRV, resting heart rate, region load, pain, fuelling and cycle context to the daily read. It says what to do about them.
- **(2) Shares without effort.** The coach gets the same brief, filtered to what the athlete shares.
- Progress beyond raw PRs keeps athletes motivated when one-rep maxes stall. It counts toward the coach's "stalled" signal (`progressStalled`).

## What's built

### Core (`packages/core/src`)

#### `wearables.ts`

Compares HRV and resting heart rate with the athlete's own baseline. No population norms are used.

- **Baseline:** the prior 28 days, excluding today, from the same source only. It needs at least 7 readings; with fewer, the status is `unknown`.
- **Sources are never mixed.** Apple Health reports HRV as SDNN and Health Connect reports RMSSD.
- **HRV is low** when today's reading is more than 1 standard deviation below the baseline mean. This is the one rule used; the "10% under" alternative is not.
- **Resting HR is high** when today's reading is at least 5 bpm above the baseline mean.

Imported workouts:

- `importedWorkoutLoad(w, maxObservedHr)` gives minutes × an estimated RPE.
  - The RPE comes from average HR as a share of the highest HR the athlete has been seen to reach. "220 − age" is never used.
  - With no heart rate, the RPE is 6.
  - The result is always labelled an estimate.
- `dedupeImported` treats a workout that overlaps a Spotter session for more than 50% of the workout's time as the same session. Spotter's log wins, and the workout's HR and kcal are attached to the session.
- `groupFlowDays` groups menstrual-flow days into periods. A one-day gap is allowed.

#### `injury.ts`

- `EXERCISE_REGIONS` maps every starter-library exercise to body regions. A test checks that the table stays complete.
- `ACTIVITY_REGIONS` does the same for imported activities. For example, running maps to knee, ankle, foot and hip.
- `regionLoads` compares each region's 7-day load with its 28-day average week. A ratio of 1.5× or more is a spike. Like `loadTrend`, it needs 21 days of history.
- `monotonyStrain` uses Foster's method over the last 7 days, counting rest days as 0:
  - monotony = mean ÷ SD of daily load
  - strain = weekly load × monotony
  - monotony above 2.0 is flagged
  - seven identical days are capped at monotony 10
- `ongoingPain` flags a region with pain on 3 or more of the last 14 days, or any log at 6/10 or above.
- `returnGuidance(region, level, coach)` gives conservative copy:
  - It always starts "Keep it pain-free: if it hurts above 3/10 during a set, stop that exercise and tell {coach}."
  - It points to a doctor or physio when pain is high or getting worse.
  - It never names a condition.

#### `progress.ts`

- Wins beyond raw PRs:
  - **Raw bests:** a new best estimated max.
  - **Rep bests:** more reps at a weight than ever before at that weight or heavier.
  - **Phase bests:** "Strongest luteal-phase Back Squat yet", compared only with the same phase's earlier best. They take `phaseOn` from `CalibrationInput`. With no cycle data (null, or no phase), there are no phase bests and nothing breaks.
- `e1rmTrend` is a least-squares slope over 6 weeks, as a percentage of the mean. It needs 3 or more sessions.
- `consistency` counts sessions in 7-day blocks against planned sessions. The streak is consecutive weeks with 2 or more sessions; the current week may still be in progress.
- `progressStalled` is true after 8 steady weeks (2 or more sessions every week) with no new best of any kind. This feeds `PhysiologySignals.progressStalled`.

#### `brief.ts`

`dailyBrief(input)` builds the brief from:

- the existing `DailyRead`
- HRV and resting-HR status
- `CycleEstimate` and `PhaseAdjustment`
- `FuelPattern`
- injury signals
- symptoms
- whether there's a coach lighter version and the planned exercises

How it decides:

- **Tone.** Strain is combined the same way as `dailyRead`: 2 or more strain signals mean ease ("You're running tired today"), 1 means watch ("Mostly good, one thing to watch"), 0 means steady ("You're good to go").
- **What counts as strain:** low HRV, high resting HR, a fuel pattern, ongoing pain and strong symptoms all count.
- **Region spikes** count as strain only alongside pain in the same region, or when no overall load spike is already counted.
- **The fuel pattern replaces the read's `fuel_low` factor**, so fuelling never counts twice.
- **The cycle phase is never strain.** It appears as context, for example "Luteal phase: your lifts usually run ~3% lower here (your own data, 5 cycles)". Hormonal contraception, post-menopause and not-tracking modes get no phase reason.

What it returns:

- "Here's why" holds at most 3 reasons, strain first and strongest first. Each names its data, for example "HRV 18% under your usual (Apple Watch)".
- "Here's what to do" holds at most 3 items, for example:
  - "Take the easier version {coach} set"
  - "Keep top sets at RPE 7"
  - "Skip the deadlift if the back pain is above 3/10 and tell {coach}"
  - "Eat carbs + protein within an hour after"
  - "Aim for bed by 10:30"
- On rest days and finished days the advice is about the day, not about sets.

`sharedBrief(brief, {shareCycle, shareFuel, sharePain})` removes a reason category, and the to-dos that came from it, unless the athlete shares it:

- cycle reasons, unless `shareCycle`
- fuel reasons, unless `shareFuel`
- pain reasons, unless `sharePain`

### Client (`apps/client`)

#### Health sources (`src/health/source.{ios,android,web}.ts`)

Each source has these methods:

- `readDays(28)` reads sleep, HRV, resting HR and active kcal per local day:
  - HRV is SDNN on Apple Health and RMSSD on Health Connect
  - Apple Watch data arrives through Apple Health
- `readNutritionDays(28)` reads daily dietary totals that other apps wrote, with those apps' names, so the UI can say "From MyMacros via Apple Health".
- `readWorkouts(28)` reads HKWorkout or ExerciseSession records with:
  - activity type, start, duration, kcal and distance
  - average and maximum HR
  - the source app
- `connectCycle()` and `readPeriods()` read menstrual flow over the last 365 days. Consecutive flow days are grouped into periods, and "unspecified/none" or UNKNOWN flow values are skipped. This permission is asked for only when the athlete turns on cycle tracking (Me → Daily check), never at the first connect.

The web source returns empty results.

#### Health store (`src/health/store.ts`)

- Caches what was read and queues `wearable.days` and `workout.import`.
- Keeps a per-activity on/off for imported workouts.
- In demo mode with no health app connected, it uses MOCK data from `packages/core/src/demo/wearables.ts`.

#### Me → Health app

- Says "Apple Watch data comes through Apple Health".
- Lists what was imported: HRV and resting-HR days, food days by app, and workouts by type with on/off toggles.
- "Check access again" asks for newly added data types.

#### Today

- The read card now shows the brief: feel as the heading, then "Here's why" and "Here's what to do". `src/brief/BriefBody.tsx` renders it.
- The easier and recovery options and the sharing caption are unchanged.
- `TodayRead`'s API is unchanged; it renders the brief internally through `src/brief/useBrief.ts`.

#### Daily check

- The live preview shows the brief.
- On submit, the shared brief is added to `sharedRead.brief` in `daily_check.submit`.
- "Something hurting?" (`src/injury/PainCheck.tsx`) records the region (three short rows), side, 0–10, a note and "Share with {coach}" (on by default). It saves a pain log immediately.

#### Pain, Progress and History screens

- **Me → Pain & injuries** (`app/pain.tsx`) shows:
  - ongoing pain with return guidance
  - region-load warnings
  - every log, with a per-log sharing toggle and delete
- **Progress** (`app/progress.tsx`, linked from Me and the top of History) shows:
  - consistency, with week bars
  - recent wins
  - e1RM trend per main lift, as text and small inline bars, with no chart library
- **History** lists imported workouts ("Run · 5.2 km · 34 min · from Apple Watch") next to sessions. A workout that duplicates a Spotter session is left out.

#### Stores and adapters

- `src/injury/store.ts` holds pain logs: zustand persisted through kv, queueing `pain.log` and `pain.delete`.
- `src/brief/inputs.ts` holds adapter hooks for cycle estimate, calibration, `phaseOn`, symptoms, fuel pattern and sharing flags. They all return null or false for now, with `TODO-INTEGRATE` comments naming `apps/client/src/cycle/store.ts` and `apps/client/src/fuel/store.ts`.

### Coach (`apps/coach`)

- **ReadSection** shows the shared brief when the client sent one: feel, Why, and what the athlete was told to do. Otherwise it falls back to the read's factors.
- **PainSection** (`src/pain/PainSection.tsx`, registered in `ClientSections.tsx`) shows:
  - ongoing pain and recent shared logs
  - region-load warnings ("Knee load this week is 1.7× usual")
- A new triage reason, `pain_ongoing`, shows "Pain logged 3 days running: knee". The demo raises it from `usePainTriage`; connected builds get it from `raise_pain_ongoing`.

### Database (`20261023030001_brief.sql`, tests in `tests/85_brief.test.sql`)

#### Tables

| Table | Owner | Coach access |
|---|---|---|
| `pain_logs` | Client-owned, with `share_with_coach` (default on) | Reads shared rows of clients they can see (`is_coach` + `can_see_client`). |
| `wearable_days` | Client-only | None. Coaches get the brief's text only, through `daily_checks.shared_read`. |
| `imported_workouts` | Client-owned | `imported_workouts_for_coach(client)` returns type, date, duration, distance and app for shared rows. Never heart rate or kcal. |

#### Functions

- `shared_reads_for_coach` is re-created with the same signature. It also strips cycle reasons from `shared_read.brief.why` unless that day's cycle phase was shared.
- `sync_handle_brief` handles:
  - `pain.log`: upsert; an older edit never wins; someone else's id is rejected
  - `pain.delete`: idempotent, and only deletes the caller's own logs
  - `wearable.days` and `workout.import`: batch upserts
- `raise_pain_ongoing(day)` is for service_role only. It raises triage from shared logs only.
- The triage reason constraint is re-added with the full list plus `pain_ongoing`.
- `delete_my_account` now also deletes `pain_logs`, `wearable_days`, `imported_workouts` and `daily_checks`. Before this, `daily_checks` wasn't covered, because profiles are never deleted and so their cascade never runs.

## Mocks

- `packages/core/src/demo/wearables.ts`, all labelled MOCK and deterministic relative to `new Date()`:
  - 28 wearable days. HRV is around 48 ms and resting HR around 58 bpm. The last 2 days are about 15% low on HRV and 6 bpm high on resting HR.
  - 14 days of MyMacros food totals.
  - 3 Apple Watch runs in the last 2 weeks.
- With the demo daily checks, the first-open brief reads "You're running tired today". The reasons are HRV, resting HR and short sleep.
- `packages/core/src/demo/brief.ts` is the MOCK transport (`spotter.pain.<tenant>`) for shared pain logs and region loads between the demo apps. The shared brief rides on the existing `spotter.reads.<tenant>` entries (`SharedReadEntry.brief`).

## Gaps

- **Not verified on device.** The Apple Health and Health Connect code is checked against the installed library types only (`@kingstinct/react-native-healthkit` 16.2, `react-native-health-connect` 4.1). Several assumptions need a real device:
  - How HealthKit reports workout duration and distance units.
  - HR statistics per workout.
  - The `productType` used to label the Apple Watch.
  - Health Connect `MenstruationPeriod` shape.
  - Health Connect's data-origin package names.
- **Existing users must re-grant access.** People who connected before this build need "Check access again" to grant the new types.
- **Skipped flow records.** As briefed, Apple Health "unspecified" flow and Health Connect "UNKNOWN" flow are skipped. Days logged only as "had flow" without an amount are therefore missed.
- **Cycle, calibration, symptoms and fuel inputs aren't wired yet.** Their adapters return null, so the brief simply has no cycle context or fuel pattern until the integrator wires `src/brief/inputs.ts`.
- **Food totals are read but not used yet.** `nutritionDays` waits for the fuel build's adapter.
- **Periods are read but not used yet.** They wait for the cycle build's adapter.
- **Tone can hint at private reasons.** The shared brief's tone and feel are computed from every input, including reasons the athlete keeps private. The coach sees "running tired" without the private reason behind it.
- **Imported workouts follow the default, not each day's choice.** They are shared per the athlete's "share my read by default" setting when imported, not per day.
- **No scheduled job yet.** `raise_pain_ongoing` needs a nightly schedule next to `raise_sleep_streaks`.
- **No real-build pull yet.** Real builds read pain logs on the coach side straight from `pain_logs`; the coach app only has the demo transport wired.
