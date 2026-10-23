# Physiology layer: training, recovery, fuelling and cycle in one read

## The problem (product brief, Oct 2026)

Women training past 35 drop out of fitness far more than men of the same age. The product brief puts the causes in
physiology, not motivation:

- chronic under-fuelling (low energy availability, the road to RED-S) disrupts hormones;
- cycle-blind programming overtrains;
- accumulated training load turns into injury;
- stalled raw PRs wear down motivation.

Tracking apps each see one slice (recovery, workouts, macros) and none connect them to a cause and a fix.

## What Spotter does about it

| Who | Gets |
|---|---|
| Athlete | A plain-English **daily brief**: "you're running tired today, here's why, here's what to do", built from sleep, HRV and resting heart rate, training load, fuelling, cycle phase, pain and the 30-second check. |
| Athlete | **Cycle-phase calibration**: suggested loads adjust to how *their own* lifts run in each phase, once there's enough of their own data to say so. Works across natural cycles, hormonal contraception, irregular cycles, perimenopause and post-menopause. |
| Athlete | **Fuel check**: energy availability from food logs and training, and a screen for the low-energy pattern (with cycle changes, repeat injuries, falling performance). Points to a doctor or sports dietitian, never diagnoses. |
| Athlete | **Progress beyond raw PRs**: calibrated bests ("strongest late-luteal squat yet"), rep bests, estimated-max trend, consistency. |
| Coach | The same read between sessions, for what the athlete chose to share, and an at-risk roster that includes physiology reasons (running tired, under-fuelled, ongoing pain, stalled). |
| Owner | Retention dashboard with **live MRR at risk**, trend, and MRR kept after check-ins. Engagement and money only: the owner never sees an athlete's health data. |

## Ground rules

1. **Their own baseline.** Every threshold that can be personal is personal (sleep, HRV, resting HR, cycle length,
   per-phase performance). Population numbers appear only where the literature gives a screening cut-off (energy
   availability bands), and they're labelled as such.
2. **Explain, don't score.** Each output names its inputs and how sure it is. No readiness rings or opaque scores.
3. **Screen, don't diagnose.** Health patterns say "worth talking to a doctor or sports dietitian", with what to bring.
4. **Private by default.** Cycle, symptoms, fuelling and pain are the athlete's. The coach sees each only when the
   athlete shares it; the owner never does. Cycle data never leaves the athlete's rows in the database without that.
5. **No auto-changes without consent.** Calibration suggests a load; the athlete (and the coach's plan) decides.

## The calibration method

`packages/core/src/physiology.ts` defines a `Calibrator` interface. `calibration.ts` ships a transparent
personal-baseline method: each phase's performance is compared with the athlete's own rolling baseline, shrunk toward
zero until enough cycles back it, and only applied (capped) once confident. A proprietary method (the provisional patent
in preparation) can replace it by implementing the same interface, with no UI changes.

## Map

| Area | Core | Doc |
|---|---|---|
| Cycle + calibration | `cycle.ts`, `calibration.ts` | `docs/features/cycle.md` |
| Fuelling + energy availability | `fuel.ts` | `docs/features/fuel.md` |
| Daily brief, wearables, injury, progress | `brief.ts`, `injury.ts`, `progress.ts` | `docs/features/brief.md` |
| Coach roster + owner MRR at risk | `atrisk.ts` (on `retention.ts`, `signals.ts`) | `docs/features/at-risk.md` |

## Personal patterns and masters motivation

Added Oct 2026, for the trainer as the buyer: see all of a client's data at once and learn, per client, what works.

- **One daily record.** `timeline.ts` joins training (logged and imported), recovery, mobility, nutrition, cycle (only
  when shared), pain and the daily check into one `ClientDay`; `rosterCell` is its compact form for an all-clients grid.
- **What works for {client}.** `patterns.ts` compares the client's own days: recovery after heavy sessions, lifts after
  short nights, effort after short nights, fuelled vs under-fuelled days, weekly volume vs progress, mobility weeks vs
  soreness, morning vs evening, and the cycle calibration. One statistics rule (Welch z ≥ 1.5 to show), minimum group
  sizes, and copy that never claims cause. `docs/features/patterns.md`.
- **Motivation past 40 and 50.** `masters.ts` finds wins when raw PRs stall: era bests ("best in a year"), strength held,
  rep, volume and density bests, coach-picked capability goals, and health-marker wins from the watch. No population
  norms; age grading is an interface waiting for a sourced table. `docs/features/masters.md`.
- **Mobility** is captured in a tap on Today and from the health app (`mobility.ts`, `docs/ux/mobility-capture.md`).
- **Devices.** `sources.ts` and `docs/features/sources.md`: Apple Health and Health Connect today; direct vendor APIs and
  aggregator services are documented options, with every vendor capability marked to verify.

| Area | Core | Doc |
|---|---|---|
| Daily record + roster cell | `timeline.ts` | `docs/features/patterns.md` |
| Personal patterns | `patterns.ts` | `docs/features/patterns.md` |
| Masters motivation | `masters.ts` | `docs/features/masters.md` |
| Mobility | `mobility.ts` | `docs/ux/mobility-capture.md` |
| Data sources | `sources.ts` | `docs/features/sources.md` |
