# Multisport core: race-format, CrossFit-style and endurance trainers

Batch A of `docs/ports.md` (rows 2, 3, 4, 5 core, 6, 10). Pure functions and data in `packages/core`, with
tests. **No UI yet.** Every ported feature still goes through the UX gate before it reaches a screen.

## What exists now, by trainer style

| Trainer | What core can do now | Module |
|---|---|---|
| CrossFit-style / functional | Read a pasted whiteboard into a structure: format (AMRAP, for time, rounds for time, EMOM, tabata, strength, intervals), time cap, rounds, rep scheme (21-15-9), EMOM window (E2MOM, "every 2:00"), work/rest, reps, loads (135/95, kg, lb, #, pood, % 1RM), calories, distance, duration, rest, scaling levels (RX/Scaled/Level n) and multi-part pastes (A/B, Strength/Metcon) | `parse/` |
| | Nine public benchmarks (Fran, Cindy, Helen, Grace, Karen, Annie, Diane, Jackie, Half Murph) and generic sessions | `templates/benchmarks.ts` |
| | 56 more library movements (Olympic lifts, gymnastics, monostructural, race stations) and aliases for search ("T2B", "C&J", "OHP") | `library.ts` |
| Hyrox / hybrid | Race-sim templates (full/half × singles/doubles/relay × 4 divisions), station constants, PFT stations, race-format training sessions | `templates/raceSims.ts` |
| | Time entry and display, pacing (even/positive/negative, quarters), fade index, roxzone, each station against the athlete's own best, "is this a simulation?" gate, and the new compromised-running read | `hyrox.ts` |
| | Race goal, finish estimate with a range and the evidence behind it, readiness in five dimensions (no score) | `race.ts` |
| Endurance | Zones from the athlete's own max HR, time in zone, efficiency factor, aerobic decoupling, run classifier on personal zones, HRR60 with a personal trend, TRIMP from the HR stream | `endurance.ts` |
| | Heart-rate energy estimate (Keytel) for fuelling, falling back to METs | `fuel.ts` |
| Every coach | Milestones for Celebrate (sessions, weeks/years with the coach, training anniversary, first race) and "back after 60+ days" for Check in | `coachToday.ts` |

## Key decisions

- **No AI in the parser.** What the rules can't read is listed in `warnings` in plain words. The source fell back to
  a client-side OpenAI call; Spotter's AI runs server-side with coach approval, and parsing doesn't need it.
- **Neutral structure.** `ParsedWorkout` / `ParsedSegment` (`parse/types.ts`) don't decide scoring or timing.
  Templates use the same structure, and a test parses each template's whiteboard text back and compares it, so
  the parser and the data check each other.
- **Loads in kg.** Pounds are converted and flagged (`loadFromLb`); a load with no unit uses `defaultLoadUnit`
  (lb by default, since unit-less pairs like 95/65 are pounds on most whiteboards), is flagged
  (`loadUnitAssumed`) and produces a warning. The second number of a pair is kept (`loadKgAlt`, `repsAlt`,
  `caloriesAlt`) without labelling who it's for.
- **Self-comparison only.** Pacing, fade, roxzone, station bests, compromised running, readiness, decoupling, run
  types and HRR trends all compare the athlete with their own history. Population bands from the source were
  dropped (see "Not ported").
- **Thresholds that remain are display or product choices, named and documented**: `EVEN_SPLIT_PCT` (5),
  `COMPROMISED_MIN_DROP_PCT` (3), `TREND_CAP_PCT` (8), `TREND_MAX_CV` (0.3), `DEFAULT_TAPER_DAYS` (14),
  `DEFAULT_LONG_RUN_MIN` (60), `SESSION_MILESTONES`, `WEEK_MILESTONES`, `RETURNING_AFTER_DAYS` (60), the
  five-zone %HRmax convention, and the plausibility gate for sims (full 30 min–3 h, half 15–90 min).
- **Published formulas, cited**: Banister impulse-response TRIMP (Banister 1991; Morton, Fitz-Clarke & Banister
  1990) with k = 0.64/b = 1.92 (men) and k = 0.86/b = 1.67 (women), used only when sex and resting HR are known;
  otherwise Edwards' zone TRIMP (1993), which needs only max HR. Keytel et al. 2005 for HR energy, **verify
  coefficients** and the valid HR range. Efficiency factor uses the conventional speed (m/min) ÷ HR.
- **Trademarks.** Template labels say "Benchmark: Fran" and "Full race sim · Singles · Open Women". Code
  identifiers keep `hyrox` where it names the format.

## Numbers marked to verify

Every one carries `verify: true` and the note "To verify against the current official standard":
- Division loads (sled push/pull, farmers per hand, sandbag, wall ball weight and reps) for all four divisions.
- Station distances, the 1 km run, and the reference run and station splits.
- Unknown (null) instead of guessed: Open Men and Pro Women reference station splits (identical in the source),
  all doubles/relay splits (the source used singles × 0.65), every PFT distance and rep count (the source had two
  conflicting versions; both are in the note).
- Notes on doubles/relay rules and on "half" being a training format, not an official race.
- Keytel coefficients and its 90–200 bpm valid range.

## Source bugs fixed (each with a regression test)

| Bug | Where | Test |
|---|---|---|
| Trend slope in s/day × weeks to race (~7× too small) | `race.ts predictRaceFinish` | `race.test.ts` "regression: the trend…" |
| Full-vs-half filter inverted | `race.ts predictRaceFinish` | `race.test.ts` "regression: a full race uses full…" |
| `new Date()` inside the predictor and readiness | `race.ts` takes `today` | all `race.test.ts` |
| Max HR defaulted to 190 | `endurance.ts maxHrFor` | `endurance.test.ts` "max HR" |
| Copy-pasted reference splits; ×0.65 doubles; 9-run full sim; conflicting PFT | `templates/raceSims.ts` | `templates.test.ts` "race sims" |
| `parseTimeInput` rejected h:mm:ss, read "5m" as 5 s | `hyrox.ts` | `hyrox.test.ts` "regression" ×2 |
| `formatRaceTime` printed ":60" | `hyrox.ts` | `hyrox.test.ts` "regression: carries…" |
| Pacing quarters 1/1/1/3 for six splits | `hyrox.ts pacingAnalysis` | `hyrox.test.ts` "regression: six splits…" |
| Anniversary years by days ÷ 365; 29 Feb never recurred | `coachToday.ts clientMilestones` | `milestones.test.ts` "regression" ×2 |
| Keytel clamped HR while saying it refuses; averaged sexes | `fuel.ts keytelKcal` | `endurance.test.ts` "no estimate outside…" |
| Rep scheme on a lift read as "for time" | `parse/format.ts` | `parse.test.ts` "Back squat 5-5-5-3-3-1 → strength" |

## Not ported, and why

- AI parse fallback (client-side OpenAI); per-segment HR-zone and duration guesses (invented pacing numbers);
  expanding rounds into one segment per round (the block model owns repetition).
- The PFT format detector (it fired on the word "test"). Third-party programming tier names in scaling headers.
- The 7:00 "median race roxzone" added to sims; HRR60 categories; decoupling labels; the run classifier's
  fixed %max bands and duration-only guess; power-to-weight levels; sRPE and ACWR bands; goal-time split weights
  and scale-to-goal; the readiness composite score, verdict and tone colours; the predictor's recovery,
  cycle-phase and specificity adjustments and fixed confidence bands.
- Birthdays (a personal date; the milestone is the training start instead).
- Recovery/yoga/foam-roll "templates", the partner and chipper templates with unclear distances, and the
  "Elite sim targeting sub-60" template.

## What the block model (row 1) and the UI will add

- **Block model (row 1)**: map `ParsedWorkout` and `TemplateWorkout` into blocks with scoring modes (run, rounds for
  time, AMRAP, interval AMRAP, EMOM, for time, rep scheme, tabata, strength, rest); store parts and scaling levels;
  decide how `repScheme`, `sets`, `rounds` and "once before/after the rounds" notes become repetition.
- **Then**: the block runner (row 9), movement trends and bottleneck stations (row 7), the AI brief (row 8).
- **UI** (each through the UX gate): paste-to-structure review screen with the warnings; template picker; race goal
  and race-readiness screen; sim results with pacing, roxzone, station bests and compromised running; zones and
  run types on imported runs; milestones in Celebrate and returns in Check in on Today. Wiring needs: the athlete's
  fresh 1 km benchmark, coach-set max HR, optional sex/age/resting HR, start dates, race dates.

## Copy strings for the UI builder to review

Athlete-facing lines use "your"; coach lines are pronoun-free or "their". Placeholders in {braces}.

**Parser warnings** (`parse/segments.ts`): "Nothing to read" · "Read the {level} level; also found {others}" ·
"This looks like {n} parts ({names}); read here as one list" · "No round count written; read as the usual 8 rounds
of 20 s on, 10 s off" · "No AMRAP length found" · "No “for time” written; read as rounds for time" · "Loads with no
unit were read as {lb|kg}: {values}" · "Couldn’t find any movements" · "Couldn’t read “{text}”".
Format labels (`WORKOUT_FORMAT_LABEL`): Race simulation, AMRAP, For time, Rounds for time, EMOM, Tabata, Strength,
Intervals, Not sure. Segment notes it writes: "odd minutes", "even minutes", "minute {n}", "max", "max reps", "per
leg", "scheme in calories/metres/feet", "cash out", "buy in", "{n} × {kg} kg", "{a}/{b} in", "RPE {n}".

**Templates** (`templates/`): labels "Benchmark: {name}", "Full|Half race sim · {Singles|Doubles|Relay} · {division}",
"Race stations, no running", "Half-distance race sim", "Run-off-the-station practice", "Race-week opener", "Station
test (PFT)", and the session names and one-line summaries in `benchmarks.ts`. Verify notes: "To verify against the
current official standard"; "Unknown: the source had the same numbers for Open Men and Pro Women (a copy-paste)";
the doubles, relay, half and PFT notes in `raceSims.ts`.

**Race analytics** (`hyrox.ts`): "Even pace: the second half was within 5% of the first" · "Slowed {n}% in the
second half" · "{n}% faster in the second half" · "{station} {time}, your first time logged" · "…, a new best by
{n} s" · "…, equal to your best" · "…, {n} s off your best ({time})" · "Running pace drops most after {station}:
{n}% slower than your|their first run" · "Every run stayed within 3% of your|their first run's pace" · "Across the
race, runs averaged {n}% slower|faster than your fresh 1 km ({time})" / coach "Runs averaged … their fresh 1 km
({time})" · across sessions: "… than your first run on average across {n} simulations (the biggest drop in {k} of
them)" and "Across {n} simulations, every run stayed within 3% of your first run's pace on average". Stations in
sentences: "the SkiErg", "sled push", "sled pull", "burpee broad jumps", "the row", "farmers carry", "sandbag
lunges", "wall balls". Empty time: "—".

**Race estimate and readiness** (`race.ts`): "No {full|half} race or simulation logged yet" · "Log one {format}
simulation to see an estimate" · "Based on {n} official {format} races and {m} {format} simulations, most recent
{today|yesterday|n days ago}" · "Starts from the best official race|simulation: {time}" · "Simulations are getting
faster|slower by about {n} s a week; over the {d} days to race day that's {time} faster|slower (limited to 8% of
the best time)" · "No trend yet: that needs 3 {format} simulations" · "Range {a} to {b}, from how much the results
vary" · "One result so far, so no range yet" · "No race-format session in the last 14 days".
Readiness labels: Volume, Engine, Recovery, Race-specific work, Taper. Readings and actions: "{n} sessions in the
last 4 weeks, up from|down from {p}|the same as the 4 weeks before" · "No training logged in the last 8 weeks" /
"Log or import sessions so this can be read" · "Get back toward {p} sessions a month before adding anything new" ·
"Hold this; no need to add volume now" · "Let volume come down; keep a few short, sharp efforts" · "Keep the week
after the race easy" · "Latest simulation {time}, {delta} faster|slower than the first in the last 8 weeks ({n}
simulations)" · "Check recovery and fuelling before the next hard session" · "Keep the current mix of work" ·
"Average heart rate in race-format sessions: {a} bpm in the last 4 weeks, {b} bpm the 4 weeks before" · "To see
the engine clearly, repeat a simulation or a 1 km time trial and compare times" · "Not enough timed simulations to
compare yet" · "Log a simulation now and another in 3 to 4 weeks" · "Use race day as the next comparison" · "No
daily read this week" / "The daily read needs sleep, HRV or the daily check" · "Running tired on {n} of the last
{d} days read" · "No tired days in the last {d} days read" · "Ease the next hard session and protect sleep" ·
"Nothing to change" · "No race-format session in the last 4 weeks" · "Plan a half simulation in the next two weeks"
· "Too close for a full simulation; do a short race-pace opener instead" · "Nothing needed now" · "{n} race-format
sessions in the last 4 weeks, the latest {d} days ago" · "Keep race-format work in the plan" · "Enough done; arrive
fresh" · "The race was {n} days ago" / "Easy week to recover" · "Race in {n} days: not tapering yet ({k} sessions
this week, usually {u})" · "Start easing off about {t} days out" · "Race in {n} days: {k} sessions this week,
usually {u}|no usual week yet" · "Cut the number or length of sessions; keep some intensity" · "Volume is already
down; keep a few short efforts".

**Endurance** (`endurance.ts`, `fuel.ts`): "Max heart rate isn’t known yet: set it, or it will come from the highest
heart rate seen in workouts" · "Heart rate drifted up {n}% relative to pace|power in the second half" · "Heart rate
came down {n}% relative to …" · "Heart rate held steady against pace|power from the first half to the second" ·
run types: Recovery, Easy, Long, Tempo, Intervals, Race effort, Not sure · reasons: "{n}% of the time in zone {z}",
"…, for {m} min", "Three or more separate hard efforts with easier running between", "No heart rate recorded for
this run" · "Heart rate recovery is {n} bpm faster|slower than your|their earlier readings (last {r} readings
against the {e} before)" / "…is about the same as…" · "Banister TRIMP from heart rate, resting {r} and max {m} bpm"
· "Zone TRIMP (Edwards) from heart rate and max {m} bpm, because sex isn’t set|resting heart rate isn’t known" ·
"Estimated from heart rate: {m} min at an average of {hr} bpm".

**Coach Today** (`coachToday.ts`): client texts "Your {nth} session with {coach}", "{n} weeks training with {coach}",
"{n} year(s) training with {coach}", "{n} year(s) since you started training", "Your first race, done"; coach texts
"{nth} session", "{n} weeks with you", "{n} year(s) with you", "{n} year(s) since starting training", "First race
done"; messages "{name}, worth marking: {text}. That's the work adding up." and "{name}, your first race is done.
Proud of you. How are the legs?"; Check in "Back after {n} weeks away" with "Welcome back! How are you feeling, and
what would you like from the next few weeks?".
