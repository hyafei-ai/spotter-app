# Ports from Station Zero (hyafei-ai/hybrid-fitness)

Rule (CLAUDE.md): take proven logic, not UX. Port into `packages/core` with tests, or re-implement the idea in
Spotter's architecture. Every ported feature still goes through the UX gate. The source repo is read-only to us.

The source has no tests, so every port gets new fixtures. Pure functions take `today` as a parameter (the source often
calls `new Date()` inside them). Numbers without a source are removed or marked "to verify".

## Never ported
- **Secrets** found in the source (reported to the product owner for rotation):
  - a Supabase service-role key and smoke-account credentials (`scripts/setup-smoke.mjs`);
  - a Stripe test secret key (`supabase/functions/README.md`);
  - a shared seed password.
- **Face recognition and pose analysis**, and the face photos and embeddings in `server/data/`: biometric privacy risk.
- **Client-side OpenAI calls** and plaintext `coaches.openai_api_key`. Spotter's AI runs server-side via Claude, with
  redaction and coach approval.
- **Opaque scores**: the readiness 0–100 score, the foundation-health score, and the race-readiness composite score.
  Spotter explains rather than scores.
- **Gym-studio features**: bookings, passes, family groups, live class and TV mode. There is no gym owner in Spotter.
- **Scraping race results** from a third-party site (terms of service). Spotter uses manual entry or paste instead.
- **Third-party programming tiers** named in seed templates.
- **Trademarked labels** in client UI. Benchmark names are common usage; avoid "CrossFit"/"HYROX" branding claims in
  the white-label UI.

## Already better in Spotter (skipped)
- Readiness and today's read → `brief.ts`, `signals.ts`
- Correlations → `patterns.ts` (Welch rule)
- Cycle → `cycle.ts`, `calibration.ts`
- Fuel → `fuel.ts`
- Aging-aware PRs → `masters.ts`
- Retention → `retention.ts`, `atrisk.ts`
- Health import → `apps/client/src/health/*`
- 1RM → `records.ts`, `programs.ts`

## Plan

| # | Port | Source | Into | Kind | Status |
|---|---|---|---|---|---|
| 1 | Block workout model + scoring modes (run, rounds for time, AMRAP, interval AMRAP, EMOM, for time, rep scheme, tabata, strength, rest) + infer type/scoring | `src/types/index.ts:236-480`, `src/utils/inferWorkoutMeta.ts` | `programs.ts`, `schemas.ts`, DB | Adapt | **Done**: `schemas.ts` `Block` (13 kinds, scoring, cap), `core/blocks.ts`, `programs.ts` (`migrateDay` v2, lossless), migration `20261027010001_blocks.sql` (+ `94_blocks.test.sql`), block results through sync; `test/blocks.test.ts`, `test/migration.test.ts`. See `docs/features/multisport-core.md` |
| 2 | Paste-to-structure parser (format detection, scaling levels, reps/loads/calories/distance/rest) | `workoutFormatDetection.ts`, `workoutTextParser.ts`, rule half of `WorkoutSegmentService.ts` | `core/parse/*` | Port | **Done**: `core/src/parse/` (types, format, scaling, segments); `test/parse.test.ts`. **UI done**: coach Paste a workout (`apps/coach/app/paste.tsx`) |
| 3 | Benchmark, Hyrox sim and PFT templates; movement library entries + aliases | `seedTemplates.ts` (filtered), `defaultTemplates.ts`, `hyroxSimTemplates.ts`, `constants/hyrox.ts`, `constants/pft.ts`, `data/movementLibrary.ts` | `core/templates/*`, `library.ts` | Port (data marked to verify) | **Done**: `core/src/templates/` (types, benchmarks, raceSims); `library.ts` (+56 movements, `aliases`, `findLibraryExercise`); `injury.ts` regions; `test/templates.test.ts`. **UI done**: coach Templates (`apps/coach/app/templates.tsx`), verify notes shown |
| 4 | Hyrox analytics: pacing, fade index, roxzone, station vs own best, `isHyroxSimulation`, time parsing; new compromised-running metric | `pacingAnalysis.ts`, split/compare screens' logic, `hyroxCalculations.ts` (parse/format only) | `core/hyrox.ts` | Port + new | **Done**: `core/src/hyrox.ts`; `test/hyrox.test.ts` |
| 5 | Race goal, finish predictor (with its two bugs fixed), readiness dimensions without a score | `raceFinishPredictor.ts`, `raceReadiness.ts` | `core/race.ts` | Port with fixes | **Done (core)**: `core/src/race.ts`; `test/race.test.ts`. **UI done**: race goal (coach client page, client Me), Today countdown, estimate + readiness on the coach client page; `race_goals` table |
| 6 | Endurance layer: zones from the athlete's own max HR, time in zone, aerobic decoupling, run classifier, HRR60 trend, new HR-stream TRIMP, Keytel HR kcal | `DeviceManager.ts`, `HealthKitService.ts:806-880`, `aerobicEfficiency.ts`, `runClassifier.ts`, `HRRecoveryService.ts`, `calories.ts` | `core/endurance.ts`, `fuel.ts` | Adapt | **Done**: `core/src/endurance.ts`; `fuel.ts` (Keytel); `test/endurance.test.ts` |
| 7 | Movement trends and bottleneck stations; aerobic and conditioning domains as gated pattern detectors | `movementTrends.ts`, `whatsWorking.ts` | `patterns.ts` | Adapt | **Done**: `core/trends.ts` (score histories, movement trends, bottleneck stations); `patterns.ts` conditioning-sleep, conditioning trend, aerobic efficiency, compromised running; `test/multisport.test.ts` |
| 8 | Strategy & Stimulus brief as a coach-approved AI draft (blocks only, redacted) | `supabase/functions/pre-workout-brief/index.ts` | `ai.ts`, edge function | Adapt | **Done**: `ai.ts` `buildDayBriefInput` / `DAY_BRIEF_*`, `functions/ai-day-brief`, `day_briefs` table; coach approves in the day editor; client sees approved only; `test/dayBrief.test.ts` |
| 9 | Block-runner state machine (EMOM windows, interval AMRAP, tabata, segment laps) for logger and watch | timer screens' logic | `core/blockRunner.ts` | Adapt | **Done**: `core/blockRunner.ts` (pure reducer on clock input); client runner screen; `test/blockRunner.test.ts` |
| 10 | Coach intel: milestones, "returning after 60 days" | `apps/coach/services/MemberIntelService.ts` | `coachToday.ts` | Adapt | **Done**: `coachToday.ts` (`clientMilestones`, `milestoneMessage`, `returningAfterBreak`); `test/milestones.test.ts` |

Known issues in the source that we fix rather than copy:
- **Predictor trend:** the slope is in seconds per day but is multiplied by weeks, so the trend is understated about 7×.
- **Predictor filter:** the full-vs-half filter is inverted.
- **Max HR:** fixed at 190, where it should be the athlete's own observed max.
- **Hyrox data:** division loads and reference splits look copy-pasted in places; they're marked to verify.
- **Invented bands:** the goal-time weights and the sRPE/HRR bands have no source; they're removed.

Fixed in Batch A (each with a regression test; details and the copy strings in `docs/features/multisport-core.md`):
- **Predictor trend**: seconds per day × days to race. **Predictor filter**: full sims for a full race, half for half.
- **Max HR**: from the coach or the athlete's own observed max; with neither, the endurance functions say so.
- **Race-sim data**: Open Men and Pro Women reference splits were identical (now null); doubles/relay splits were
  singles × 0.65 (now null); the full sim had a 9th run after the last station (removed); the two PFT definitions
  disagreed (now null, both versions in the note). Every division load and reference split is marked `verify`.
- **Time entry**: `parseTimeInput` rejected "1:02:03" and read "5m" as 5 s; `formatRaceTime` could print ":60".
- **Pacing quarters** were uneven when the split count wasn't a multiple of 4.
- **Anniversaries** counted years as days ÷ 365, and a 29 February start never recurred.
- **Keytel** clamped heart rate while documenting a refusal (now refuses outside 90–200 bpm), and averaged the men's
  and women's equations when sex was unknown (now falls back to the MET estimate).
- **Not ported** (population numbers or out of scope): the 7:00 "median race roxzone" added to sims, HRR60 and
  decoupling categories, the run classifier's fixed %max bands and duration guess, power-to-weight levels,
  sRPE/ACWR bands, goal-time split weights, the PFT format detector, the AI parse fallback, birthdays.

