# Fuel check: energy availability and the low-energy pattern screen

Serves the client job in `docs/jtbd.md` (**trains around body variance**: under-fuelling is one of the biggest reasons
women 35+ stop training) and, when the athlete chooses, the coach job (**remembers** something they'd otherwise miss).
Part of the physiology layer (`docs/physiology.md`). It is a screen, never a diagnosis.

## What's built

**Core** (`packages/core/src/fuel.ts`)
- `fatFreeMassKg(bodyweightKg, bodyFatPct)`: null when body fat is unknown. Nothing is guessed silently.
- `estimatedFfm(bodyweightKg)`: assumes 30% body fat. Used only when the athlete chooses "Use an estimate", and marked `estimated` with a note that says so wherever it's shown. `ffmFor` picks between the two.
- `exerciseKcalEstimate({durationMin, feel}, bodyweightKg)`:
  - about 5 METs for a strength session, about 6 when the finish screen says it felt rough or tough
  - minus 1 MET for what the body burns at rest anyway, labelled "Estimated"
  - `exerciseForDay` prefers the wearable's active kcal during workouts when there is one
- `intakeForDay(spotterLog, healthDay, pref)`: which food number a day uses.
  - `auto` uses the health store (Apple Health / Health Connect, written by apps like MyMacros) when it has food that day, else Spotter's own log
  - `health` and `spotter` use only that source
  - the two are **never added**: many apps write the same food to Health, so summing would double-count
  - returns a source label ("From MyMacros via Apple Health", "Logged in Spotter")
  - `HealthNutritionDayLike` is a local structural copy of physiology.ts `HealthNutritionDay`, which the brief build adds. TODO-INTEGRATE: switch to the shared type
- `energyAvailability(day, ffmKg)` = (intake − exercise) ÷ FFM, in kcal per kg FFM per day. Null when no food was logged (never treated as zero).
- `eaBand`: 45 or more adequate, 30 to 45 reduced, under 30 low.
- `fuelPattern(input)`: a 14-day window. Today is left out because it isn't over.
  - It needs 5+ logged days before any energy-availability judgement. Until then the band is `unknown` and the note says "Log food on a few more days to see this". With no fat-free mass it asks for body fat % or "Use an estimate".
  - Signs:
    - `low_ea`: EA under 30 on at least half the logged days
    - `cycle_change`: from `CycleEstimate.irregularities`, natural or irregular mode only
    - `injury_repeat`: pain in one area on 3+ days, or in 2+ areas
    - `performance_drop`: estimated max down 5%+ over 6 weeks
    - `energy_mood_low`: energy 2 or lower on 5+ daily checks
    - `weight_drop`: more than 2% down in about 4 weeks, counted only alongside `low_ea`
  - Level:
    - `talk_to_someone`: `low_ea` plus any of cycle change, repeat injury, performance drop or weight drop; or no period for 90+ days on its own
    - `watch`: `low_ea` alone, or reduced EA with 2+ other signs
    - otherwise `none`
  - Fixes are concrete and kind:
    - extra kcal on training days, worked out from the training-day gap to 45, rounded and kept between 150 and 500, mostly carbs, with "a bagel with peanut butter is roughly 300"
    - carbs and protein within an hour after training
    - don't train fasted before heavy sessions
    - in the luteal phase, an optional line: "Many people find appetite runs higher in the days before a period. Eating to it on training days is fine"
    - at `talk_to_someone`: "Worth booking a doctor or sports dietitian. Bring: this screen, your period dates, and recent injuries"
  - Copy never moralises about food and never mentions weight loss. A test checks the wording.
  - Returns `FuelCheck`, which extends the shared `FuelPattern` with `perDay`, `loggedDays` and `note`.
- `fuelFactorFromPattern(pattern)`: a `ReadFactor`-shaped `{kind: 'fuel_low', text, strain}` for the brief builder. `signals.ts fuelStatus` is unchanged.
- `trainingDayTargetKcal(base, sessionKcal)`: the base target plus the session's energy, rounded to 50.
- Tests: `packages/core/test/fuel.test.ts`, 27 tests. They cover:
  - sparse logs
  - missing FFM
  - bands
  - the talk_to_someone rule
  - no period for 90+ days on its own
  - cycle changes ignored outside natural or irregular mode
  - weight_drop only with low EA
  - `intakeForDay` preferring health, falling back, and never summing
  - the demo data
  - both mutations
  - the triage copy

**Client**
- `/nutrition/fuel`, "Fuel check":
  - the level in words, the average energy availability with its band, and "Screening bands, not a diagnosis"
  - signs ("What it noticed") and fixes ("What helps")
  - each day:
    - a bar with tick marks at 30 and 45
    - the value and band as text, so meaning never depends on colour
    - intake with its source label
    - a "Training day" tag with the training energy (estimated or from the watch)
  - Your numbers:
    - bodyweight, kept on the phone
    - body fat % (optional)
    - "Use an estimate (assumes 30% body fat)" when body fat is empty
  - Where your food comes from: Apple Health (falls back to Spotter on days Health has nothing) or Logged in Spotter
  - "Share fuel check level with {coach}", off by default, with what the coach does and doesn't see
  - "How this is worked out" disclosure: formula, FFM, MET estimate, where the bands come from, limits
  - Empty states:
    - nutrition off: an explanation, though entry points are hidden anyway
    - nothing logged
    - sparse logs and missing FFM: the note from core
- Entry points, all gated by `isOn('nutrition')`:
  - a row on the nutrition day view (today, not in Off mode)
  - Me → "Fuel check"
  - Today → Due → "Fuel check: worth a look", only at `talk_to_someone`
- Nutrition day view:
  - "Training day: target +X kcal" when today has a planned or finished session (macros mode), and the calorie target row includes it
  - when the health store has food for the day, its totals with the source, and "Logged in MyMacros? It's already here, so there's no need to log it again. Logging in Spotter is optional." The summary uses those totals
- Store `src/fuel/store.ts` (zustand + persist kv, key `spotter.fuelcheck.<tenant>`). Settings are queued as `fuel.settings.set`. While sharing is on, the level and signs' text are queued as `fuel.pattern.share` whenever they change (published from the Today row and the fuel screen).
- `src/fuel/healthIntake.ts`: TODO-INTEGRATE adapter for the health store's food days. It returns `[]` in real builds and MOCK days in the demo.

**Coach**
- Client detail → "Fuelling" (`src/fuel/FuelSection.tsx`):
  - the shared level, signs and "what to say", using the client's name, never pronouns
  - or "Jordan keeps the fuel check private."
  - never food logs, energy figures, body fat or bodyweight. The Nutrition section's view of the food log (targets, today's totals, days logged) is unchanged
- Triage reason `fuel_pattern`, "Fuel check flagged: worth a conversation" (priority 62), when a shared level is `talk_to_someone`. In the demo, `useFuelTriage` opens one item per open flag.

**Database**: `20261023020001_fuel.sql`
- `fuel_settings` is client-owned (`body_fat_pct`, `use_estimate`, `intake_source`, `share_with_coach` default false). It has no coach policy, so body fat stays private.
- `fuel_shares` (`client_id`, `share_date`, `level`, `signs` jsonb up to 6):
  - only the client writes
  - coaches read through `is_coach` + `can_see_client` + `fuel_shared(client)`, so turning sharing off hides every past share at once
- `sync_handle_fuel` handles `fuel.settings.set` and `fuel.pattern.share`:
  - an older edit never overwrites a newer one
  - a share is refused (forbidden) while sharing is off
- A security-definer trigger on `fuel_shares` opens one `fuel_pattern` triage item per open item. It fires inside the sync handler's write.
- The `triage_items` reason constraint is redefined with the full list plus `fuel_pattern`. Other physiology builds may redefine it too, and the integrator reconciles.
- Tests: `tests/84_fuel.test.sql`, 19 checks, covering:
  - sharing gate
  - one share per day
  - last-write-wins
  - one triage item
  - the coach can't read settings or edit shares
  - off hides past shares
  - other tenants and clients see nothing

## Where the numbers come from, and their limits
- The bands are **commonly used screening cut-offs** from the sports-science literature on energy availability (Loucks and colleagues). They come from population studies, which is why they're labelled "screening bands, not a diagnosis" in the app.
- Self-reported food intake usually **under-counts** what was eaten, so EA tends to read low.
- Exercise energy from METs is **rough**. A wearable's workout kcal is preferred but is also an estimate.
- The 30% body-fat estimate is a labelled assumption, used only when the athlete opts in.
- The sign rules are product rules for a screen, not clinical criteria.

## Mocked (labelled `MOCK` in code)
- `packages/core/src/demo/fuel.ts`: two weeks for Jordan (about 62 kg, body fat not entered, "Use an estimate" already chosen).
  - Food comes "from MyMacros via Apple Health", with 2 days unlogged.
  - Training days run a few hundred kcal under rest days, giving band "reduced" and level "watch".
  - The other signs are a knee niggle on 3 days and an estimated-max trend of −6%.
- The demo's estimated-max trend and pain logs stand in for progress.ts and injury.ts.
- Coach transport: `readShared`/`writeShared` under `spotter.fuel.<tenant>`, standing in for `fuel_shares`.

## Gaps
- TODO-INTEGRATE:
  - `healthIntake.ts` needs the health source's nutrition read
  - `useFuelCheck` passes `cycle: null`, and in real builds no pain logs or estimated-max trend. Wire to `cycle.ts`, `injury.ts` and `progress.ts`
  - the wearable's workout kcal goes to `exerciseForDay`
- Bodyweight is typed on the fuel screen (kept on the phone). It isn't yet pre-filled from the health app's bodyweight reading.
- The brief builder should use `fuelFactorFromPattern` in place of, or alongside, `fuelStatus`.
- The connected coach app doesn't read `fuel_shares` yet (demo transport only). Triage items arrive through `triage_items` as usual.
- The training-day target adds kcal only; macro targets aren't split.
