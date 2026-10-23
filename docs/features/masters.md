# Masters motivation: wins beyond raw PRs

For clients past 40, and more so past 50, all-time bests get rare, and a flat estimated max wears motivation down.
`packages/core/src/masters.ts` finds the honest wins that are still there, from logged data only, and never against a
population norm. It extends "progress beyond raw PRs" in `progress.ts` (raw, phase and rep bests).

## Wins

| Kind | Rule | Coach line (example) |
|---|---|---|
| `era_best` | The best estimated max in the last 4 weeks beats everything since an anchor (2 years ago, a year ago, 1 January, turning 40/50/60…, starting with the coach), there are 3+ sessions of the lift since the anchor, and something before it was higher (all-time bests are raw PRs, not era bests). The oldest anchor that holds wins. | Best Back Squat in a year (82.8 kg est. max) |
| `holding_strong` | Each week's best is within 3% of the best of the 12 weeks up to it, for 8+ weeks in a row (one empty week is skipped, two end the run). | Back Squat strength held for 22 weeks |
| `rep_best` | `progress.ts` rep bests from the last 4 weeks, one per lift | Romanian Deadlift: 10 reps at 50 kg, most at that weight |
| `volume_week` | The last 7 days moved more (kg × reps) than each of the 8+ weeks before | Biggest week in 12 weeks: 8.1 t lifted |
| `session_sets` | The latest session had more hard sets than each of the 8+ sessions before | Most hard sets in a session in 10 sessions: 18 |
| `density` | Same lifts, at least 95% of the tonnage of an earlier session, in 10%+ less time (5+ minutes) | Same Full Body A work as 17 Oct, 11 min faster |
| `capability_reached` / `capability_best` | A coach-picked capability goal: target reached for the first time, or a new best, in the last 4 weeks | Goal reached: Single-leg balance, eyes open (31 s) |
| `resting_hr` | Resting HR, last 14 days vs the same 14 days 8 weeks earlier, down 3+ bpm (7+ readings each, one source) | Resting HR down 3 bpm in 8 weeks |
| `hrv_baseline` | HRV, last 28 days vs 28 days 8 weeks earlier, up 5%+ (14+ readings each, one source) | HRV baseline up 6% in 8 weeks |
| `sleep_regularity` | Night-to-night SD of sleep hours, same windows, down by 0.2 h and to 80% or less | Sleep steadier: nightly swing 0.6 h → 0.4 h |

The thresholds (3%, 8 weeks, 3 bpm, 5%, 0.2 h) are product choices for what is worth saying, not physiology claims.
HRV is never compared across sources (SDNN from Apple Health, RMSSD from Health Connect).

Each win carries `text` for the client ("Held your Back Squat strength for 22 weeks") and `coachText` for the coach
(short, no pronouns, numbers in plain words, readable in under 3 seconds).

- `winsToMention(input, today)`: the coach's prep, top 3, at most one per kind, ordered by weight (how meaningful)
  minus 1.5 points per day old.
- `weeklyWins(input, today)`: the client's week, wins dated in the last 7 days.

## Capability goals

`CapabilityGoal { id, title, unit ('kg' | 's' | 'm' | 'reps' | 'cm' | 'yes_no'), target, direction, history }`.
`yes_no` (added to the units in the brief) records 1 for done. `capabilityProgress(goal)` gives the latest, best,
whether it's reached, a 0–100 bar and text ("32 of 40 m", "Reached: 31 s", "Done").

Starter goals a coach can pick (`CAPABILITY_STARTERS`): farmer carry with bodyweight total (40 m), single-leg balance
(30 s, the shorter side), floor to standing without hands (done / not yet), dead hang (target set by the coach), sit and
reach (target set by the coach). The suggested targets come from the goals' own wording; there are no population
norms, and the coach and client set the real target.

## Age-graded results

Only an interface, `AgeGrader { id, source, grade(...) }`. Age grading needs a sourced coefficient table (for example
the masters age coefficients a weightlifting or powerlifting federation publishes), cited by name and edition, shown
with every graded number. None ships: no coefficients are invented.

## MOCK demo

`demoMastersInput(clientId)` / `demoWins(clientId)` in `packages/core/src/demo/patterns.ts`.

- **Mei Tanaka, 52** (age from `DEMO_CLIENT_AGES`): two and a half years of training, raw estimated max flat to
  slightly down, a three-week break. Coach's top 3: "Goal reached: Single-leg balance, eyes open (31 s)", "Best Back
  Squat in a year (82.8 kg est. max)", "Romanian Deadlift strength held for 24 weeks". The week also has holding strong
  on the other lifts, resting HR down, HRV baseline up, a rep best, the biggest week on record, the same session 11
  minutes faster and steadier sleep.
- **Jordan Ellis, 41**: a dead-hang new best and steadier sleep (raw bests come from `progress.ts`).
