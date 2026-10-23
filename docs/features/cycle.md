# Cycle tracking and cycle-phase calibration (physiology layer)

Serves the client job in `docs/jtbd.md` (*train around my body's variance*) and the physiology brief in `docs/physiology.md`: cycle-blind programming overtrains, so suggested loads follow how **this athlete's own lifts** run in each phase, once there's enough of their own data to say so. It works across seven modes: natural, hormonal contraception, irregular, perimenopause, post-menopause, pregnant or postpartum, and not tracking.

All rules live in `packages/core/src/cycle.ts` and `calibration.ts`. Shapes are in `physiology.ts`. Nothing in the apps re-implements a threshold.

## What's built

**Core: the cycle estimate** (`estimateCycle(profile, date)`)
- Typical length is the median of the last 6 complete cycles, counting only cycles of 15–60 days. Cycles outside that range are listed as irregularities rather than counted.
- Phases count back from the predicted next start, because the luteal half is the steadier one:
  - menstrual: the logged bleeding days, or 5 days when no end is logged
  - luteal: the 13 days before the next start
  - ovulation: the 3 days before luteal
  - follicular: the days in between
- Looking back, when the next period is already logged, phases use that cycle's real length. This is what calibration uses for past sessions.
- Confidence:
  - `none`: under 1 complete cycle
  - `low`: 1–2 cycles, or a spread of more than 7 days
  - `medium`: 3–5 cycles
  - `high`: 6 cycles with a spread of 4 days or less
- Next-period window: the typical length ± half the spread, at least ± 2 days.
- By mode:
  - Irregular and perimenopause show a phase only at `medium` or above. Below that, `phase` is null and the note says why.
  - Hormonal, post-menopause, pregnant or postpartum, and not tracking always have a null phase, with a plain note, e.g. "On hormonal contraception, the app uses your own day-to-day data instead of cycle phases."
- Irregularities, worded neutrally. They feed the fuel screen:
  - in natural mode, a cycle over 35 days
  - in natural mode, "No period logged for 94 days" (90+)
  - in natural mode, the last cycle more than 7 days off the usual length
  - in any phased mode, out-of-range cycles
- `mergePeriods(logged, imported)` merges periods read from Apple Health / Health Connect without double entry. A start within 3 days of an existing entry is dropped, so the athlete's own entry wins. Imported periods carry `source: 'health'`.
- `SymptomLog`: 0–3 for each of the nine symptoms in `SYMPTOMS`.

**Core: calibration** (`personal-baseline-v1`, "Your own baseline")
- Per session and per lift, the best estimated 1RM (`estimatedOneRepMax`, Epley, 1–12 reps) is compared with the median of that lift's e1RMs over the previous 56 days. The session itself is excluded, and a lift needs 3 earlier sessions before it counts.
- Effort signal: when RPE is logged at the same load and reps as earlier sets, each RPE point above the athlete's usual counts as −3%. That figure is an approximation from common RPE charts and is labelled as such in code.
- The session deltas are grouped by `phaseOn(date).phase`, averaged, then shrunk toward 0 by n/(n+6).
- Confidence for a phase:
  - `medium` needs ≥ 4 sessions, ≥ 2 cycles, and a standard error ≤ 1.5 points, so noisy data stays `low`
  - `high` needs ≥ 8 sessions, ≥ 4 cycles, and a standard error ≤ 1
- `appliedPct` is 0 unless confidence is at least `medium` and the shrunk delta is at least 2%. When it applies, it's rounded to 0.5% and capped at ±5%.
- The summary names the evidence: "After 7 cycles of your own data: your lifts in the luteal phase run about 3% under your usual, so suggested loads are 3% lighter then."
- `calibratedLoad(plannedKg, calibration, phase, incrementKg)` rounds suggestions to the plate increment. With no adjustment the planned load comes back untouched, and logged values are never rounded.
- `CALIBRATORS` / `ACTIVE_CALIBRATOR` / `activeCalibrator()`: another method (e.g. the proprietary one in `docs/physiology.md`) registers under its own id. The shipped method is **not** that method.

**Client: Me → Your cycle** (`/cycle`, row via `MeRows`)
- Mode picker: seven modes, one line each.
- Periods list: add, edit (start as "days ago", optional length) and delete. "Import from Apple Health" (Health Connect on Android) is offered only while tracking is on, and it's read-only. Imported periods are labelled "From Apple Health".
- Today: the phase line ("Luteal phase, day 22 (estimated)"), the note, confidence in words, the usual length, the next-period window, and irregularities with a soft "worth mentioning to a doctor if they continue". "An estimate from your own logs, not a diagnosis."
- What your training data shows: the calibration summary, then a row per phase with how lifts run vs usual, sessions, confidence in words, and whether the app applies it.
- Sharing with the coach: off by default. It says exactly what the coach sees (today's phase and the summary) and never sees (period dates, symptoms, mode).
- Symptoms today: 0–3 per symptom. Open by default in perimenopause and post-menopause, behind a disclosure in other modes. Never shared.
- Offline first: `cycle.profile.set`, `cycle.period.upsert`, `cycle.period.delete` and `cycle.symptoms.log` are queued. The Me row refreshes today's phase and summary once a day so the server copy doesn't go stale.

**Client: daily check** (`/check-today`)
- With tracking set up, the cycle line is read-only: "Luteal phase, day 22 (estimated)", with a "Not right? Log your period" link and the per-day share toggle.
- The manual phase control remains only as a fallback:
  - natural, irregular or perimenopause mode with no periods logged
  - the older "Track your cycle" setting with the mode still "not tracking"
- Other modes show the mode note.
- `DailyCheck.cyclePhase` is filled from the estimate, so `dailyRead`, `sharedRead` and the coach read work unchanged.

**Client: session logger**
- When today's phase has a non-zero `appliedPct`, suggested loads (planned or progression) go through `calibratedLoad`. One line sits above the exercises: "Loads 3% lighter today: your lifts run lower in the luteal phase (7 cycles of your own data)." It has a "Use planned loads instead" toggle per session.
- Calibration is skipped when the athlete chose the coach's easier or recovery version, so the two reductions never stack.

**Coach: client detail → Cycle** (`CycleSection` via `ClientSections`)
- Shared: today's phase (estimated), the calibration summary, and "Applies 3% lighter to suggested loads today", or "No change".
- Not shared: "Jordan keeps cycle data private."

**Database**: `20261023010001_cycle.sql`
- `cycle_profiles` (client_id pk, tenant, mode, birth_year, share_with_coach, today_phase, today_phase_on, calibration_summary jsonb, updated_at), `period_logs` and `symptom_logs`.
- RLS on all three is own-rows only, with no coach policy (like `daily_checks`).
- `cycle_shared_for_coach(client)` is security definer. It returns phase, phase date, summary and updated time, and only when:
  - sharing is on
  - the caller `is_coach` and `can_see_client`
  - the caller is the client's assigned coach, or the owner when the client has no assigned coach
  - That means an owner whose clients are coached by assistants doesn't get cycle data, even though `can_see_client` lets owners see everything else. A solo owner-coach does see what their own clients share.
- `sync_handle_cycle` handles the four mutation kinds. Profile edits use last-write-wins on the phone's `updatedAt`, so an older queued edit never overwrites a newer one. A period delete only touches the caller's rows.
- Account deletion: `delete_my_account` anonymises the profile rather than deleting it, so the cascades don't fire. A trigger on memberships deletes all cycle rows when the account-deletion flag ends that member, which keeps working if `delete_my_account` is rewritten later.
- Tests: `tests/83_cycle.test.sql` (22 checks). They check that:
  - the client sends changes from the queue, and an older profile edit doesn't win
  - the coach can't select any table
  - the coach sees nothing until it's shared, then sees only the projection
  - the owner of an assistant-coached client sees nothing
  - another tenant sees nothing
  - another client can't change or delete a period
  - deleting the account removes every row

## Mocks
- `packages/core/src/demo/cycle.ts` (MOCK):
  - Jordan is in natural mode with 7 logged periods (cycles of 27–31 days, usual 29), so today is day 22, in the luteal phase.
  - About 6 months of sessions with squat, bench and deadlift (`back-squat`, `bench-press`, `deadlift`). Sets use 0.5 kg steps so the dip isn't lost in plate rounding. The luteal dip is −3.5%, and −5% in the last 5 days before a period.
  - Result: calibration ready, luteal applied −3%, other phases 0.
- The demo apps pass the coach projection through `readShared`/`writeShared` under `spotter.cycle.<tenant>`, standing in for the RPC. Only the shared projection is written: `{ shared, date, phase, calibration summary }`, never dates or symptoms.
- Before the client app writes anything, the coach sees "keeps cycle data private" (the demo profile starts private).

## Gaps
- `src/cycle/healthPeriods.ts` returns `[]` until the brief builder's `health.readPeriods()` lands (TODO-INTEGRATE).
- The contract has four phases, so "late luteal" can't be its own bucket. The demo's deeper late-luteal dip shows up as a smaller whole-luteal average. A sub-phase would need an optional field on `CycleEstimate`.
- Calibration runs on the phone and the server stores the client-computed summary, so the server trusts that text as sent (same as the daily read).
- Server-side `today_phase` is only as fresh as the last time the app opened Me or changed cycle data.
- The fuel screen should not treat missing periods as a sign in `pregnant_postpartum` or `hormonal`. `estimateCycle` returns no irregularities in those modes, but the fuel builder's rule has to agree.
- `daily_checks` rows (which can hold a cycle phase) are not removed by `delete_my_account` today. That's outside this area, but worth a follow-up.
