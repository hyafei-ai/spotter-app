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
| Coach | The same read between sessions, for what the athlete chose to share, and one **Needs attention** list with physiology reasons (running tired, under-fuelled, ongoing pain, stalled). A check-in card on client detail to log "I checked in". |
| Coach (their business) | The coach owns their coaching business, so they also get the business view, **Keeping clients**: live MRR at risk, the 12-week trend, and MRR kept after check-ins. Assistant coaches in a team don't see money. |

## Ground rules

1. **Their own baseline.** Every threshold that can be personal is personal (sleep, HRV, resting HR, cycle length,
   per-phase performance). Population numbers appear only where the literature gives a screening cut-off (energy
   availability bands), and they're labelled as such.
2. **Explain, don't score.** Each output names its inputs and how sure it is. No readiness rings or opaque scores.
3. **Screen, don't diagnose.** Health patterns say "worth talking to a doctor or sports dietitian", with what to bring.
4. **Private by default.** Cycle, symptoms, fuelling and pain are the athlete's. Their coach sees each only when the
   athlete shares it. In a team, only the client's own coach sees it (the head coach gets a neutral "their coach has
   flagged something" line for an assistant's client). Cycle data never leaves the athlete's rows in the database
   without that.
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
| Needs attention + the coach's business view (MRR at risk, kept) | `atrisk.ts` (on `retention.ts`, `signals.ts`) | `docs/features/at-risk.md`, `docs/features/retention.md` |
