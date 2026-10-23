# What works for {client}: personal patterns

Serves the coach's job of making training truly personal: per client, what works, what doesn't, how much recovery
they need and what's missing. Everything is computed from the client's own history; there are no population norms.
The physiology layer is described in `docs/physiology.md`.

## The daily record (`packages/core/src/timeline.ts`)

`buildTimeline(inputs, from, to)` gives one `ClientDay` per calendar day:

| Field | From |
|---|---|
| `training.sessions[]` | Spotter sessions (`CalibrationSession` + optional title, duration, start time) and imported workouts. A workout overlapping a Spotter session is the same session (`dedupeImported`). Yoga, Pilates, stretching and mind-and-body go to mobility, not training. |
| session `load` | minutes × RPE (`sessionLoad`); imported: `importedWorkoutLoad` (an estimate) |
| session `hardSets` | sets with RPE 7+, or with no RPE logged (Spotter logs working sets) |
| session `rpe` | mean logged set RPE, else from the finish-screen feel |
| session `deltaPct` | lifts against the client's own rolling baseline, `relativePerformance` in `calibration.ts` (the same helper calibration uses) |
| session `bests`, `groupSets`, `muscles` | best estimated 1RM per exercise; hard sets per main group (starter-library tag) |
| `recovery` | sleep (watch, else the daily check), HRV and resting HR, each against the 28-day baseline from the same source (`wearables.ts`); `hrvLow` is the 1-SD rule |
| `mobility` | Spotter logs (`mobility.ts`) plus imported mobility, one per kind per day |
| `nutrition` | one source per day: the health app if it has food, else Spotter, never summed; `vsTarget` = kcal ÷ target |
| `cycle` | only when the caller passes `phaseOn`, i.e. when the client shares the cycle with whoever reads the timeline |
| `pain`, `check` | pain logs above 0; the daily check's energy, soreness, stress |

Minutes for a session without a recorded duration are estimated at 2.5 per logged set.

`rosterCell(day)` is the compact cell for the all-clients grid: `trained`, a tone (`steady` / `watch` / `ease`, same
rule as the daily read: 2+ strain signals ease, 1 watch) and flags (`short_sleep`, `low_hrv`, `pain`,
`under_fuelled` at under 75% of the calorie target).

## The pattern finder (`packages/core/src/patterns.ts`)

`findPatterns(days, { calibration })` runs every detector over one row per day (use `buildTimeline`; gaps throw) and
returns what the data supports, most confident first, then biggest effect. Each `Pattern` has a short title with the
number, what was compared (`detail`), the effect with its unit, group sizes, confidence, a suggestion and domains.

| Detector | Compares | Needs | Smallest effect shown |
|---|---|---|---|
| `recovery_time` | days until HRV is back within baseline after heavy sessions (top quarter of the client's own day loads) vs other training days | 6+ in each group with HRV after | half a day |
| `sleep_performance` | `deltaPct` after short nights (under 6.5 h, or an hour under the 14-night average) vs normal nights | 6 + 6 sessions | 1% |
| `sleep_rpe` | session RPE after short vs normal nights | 6 + 6 | 0.5 RPE |
| `fuel_performance` | `deltaPct` on days eaten to 90%+ of target (or carbs to 90%+) vs under | 6 + 6 | 1% |
| `volume_response` | weekly hard sets (per main group when known) in the client's own thirds, against the 4-week change in estimated max | 12 weeks, 3+ weeks per third, volume varying by 2+ sets | 1% per 4 weeks |
| `mobility_soreness` | average daily soreness in weeks with 2+ mobility sessions vs fewer (weeks are the unit) | 6 + 6 weeks with 3+ checks | 0.3 points |
| `time_of_day` | `deltaPct` in sessions starting before 12:00 vs from 16:00 | 6 + 6 | 1% |
| `cycle_phase` | wraps the calibration (`calibration.ts`), never re-computed; the phase the app acts on first | a ready calibration, medium+ | 1% |

### The statistics rule

One rule for every detector, so it can be explained in a sentence:

- Each group needs at least 6 values (stated exceptions above).
- z = |difference of means| ÷ Welch standard error, √(varA/nA + varB/nB) with sample variances. z ≥ 2 is high
  confidence, z ≥ 1.5 medium, and below 1.5 the pattern isn't shown. It's analytic, so the same history always gives
  the same answer (no random resampling).
- `volume_response` reads each 4-week change as the sum of what each of its weeks contributed at that week's volume
  (least squares over the three volume ranges), then compares the best range with the average of the other two using
  the regression's standard error, with the same z rule. Its windows overlap, so neighbouring values aren't
  independent; it is capped at medium confidence for that reason.
- Strength level for `volume_response` is the best of three neighbouring weeks, so one off week (short nights, the days
  before a period) doesn't read as lost strength.

These are not significance tests in the formal sense: many detectors run on the same history, and days aren't
independent. The thresholds keep weak differences off the screen; they don't prove anything.

### Limits

- **Correlation, not causation.** Titles say "tend to" and suggestions are things to try and watch. A client may sleep
  badly *because* of a stressful week that also hurts training.
- **Minimum data.** Most detectors need about 8 weeks with sessions and wearable or check data; volume needs 12. Under
  that, nothing is shown (not "no pattern").
- **Only what's logged.** Missing sleep, food or soreness means fewer comparisons, not zeros.
- **Cycle only when shared,** and only through the calibration the client already sees.

### How the coach should use it

- Read a pattern as a lead for a conversation ("you tend to lift about 5% lower after short nights: does that match how
  it feels?"), not a verdict.
- Pin what's worth acting on to the client's playbook (`PlaybookEntry { patternId | null, text, pinnedAt, source }`;
  `pinPattern` makes one from a pattern, `source: 'coach'` for the coach's own notes). UI comes later.
- Re-check after a block: patterns move as the client changes.

## MOCK demo (`packages/core/src/demo/patterns.ts`)

`demoClientDays(clientId)` gives 16 weeks for Jordan Ellis (41) and Mei Tanaka (52; age from `DEMO_CLIENT_AGES`).
Jordan's history reuses the cycle sessions, wearables, food and checks of the other demo files and adds the weeks
before them, with effects built in on purpose. `demoClientPatterns(DEMO_JORDAN_ID, now, { includeCycle: true })`
yields:

1. Lifts tend to run 5% lower after short nights (high)
2. Lifts tend to run 3% lower in the luteal phase (high; only with `includeCycle`, Jordan keeps the cycle private by default)
3. HRV takes about 2 days to recover after heavy sessions (high)
4. Less sore in weeks with 2+ mobility sessions (2.3 vs 3.0 of 5) (high)
5. Leg lifts progress best at 12–14 hard sets a week (medium; detail: progress stalls above about 18)

Food and time of day carry no built-in effect, and no pattern appears for them.
