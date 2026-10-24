# Any trainer style: blocks, paste, templates, logging WODs, intervals and race sims (UX record, Oct 2026)

Method: `anthropic-skills:app-ux-improvement`, as CLAUDE.md requires for a big change (new screens, new flows, a new
feature area). Sections 1–6 were written **before building**; sections 7–13 were added **after building**, from
screenshots of the web build and timed walkthroughs. Personas and timings are design hypotheses checked on the
demo build, not research with real trainers. All demo data is MOCK.

Engineering and the copy strings: `docs/features/multisport-core.md`. Ports: `docs/ports.md` rows 1, 2-UI, 3-UI, 7,
8, 9.

---

## 1. Facts, assumptions, hypotheses

**Facts provided**
- The trainer is the buyer; any style must feel native: strength, hybrid / race-format (Hyrox-style), CrossFit-style
  functional fitness, endurance, general fitness (CLAUDE.md, product owner).
- Until now a session was a list of exercises × sets. A WOD, an EMOM, a 5 × 1 km threshold run or a race
  simulation could only be faked with "time" and "distance" sets, and nothing could be scored.
- Core already reads a pasted whiteboard (`parse/`), has benchmark and race-sim templates (`templates/`), race
  analytics (`hyrox.ts`, `race.ts`) and endurance maths (`endurance.ts`), none of it on a screen yet.
- The watch already runs `interval`, `station` and `timed` blocks (MOCK only so far).

**Assumptions**
- A CrossFit-style coach writes the day's workout once (often on a whiteboard or in Notes) and wants it in every
  client's app in under a minute. They think in "the WOD", not in "exercise rows".
- A race-format or endurance coach thinks in sessions made of parts: "warm-up, 5 × 1 km at threshold, 2 min jog".
- Clients log conditioning with a timer running, out of breath, sometimes chalky: big numerals, one big button,
  everything else later.
- A strength coach must not see any of this unless they want it (no new steps for a 5 × 5 day).

**Hypotheses to check on the build**
- MS-H1: a coach pastes a CrossFit whiteboard and sends it to a client in under 60 s and about 5 taps.
- MS-H2: a client logs an AMRAP score in 2 taps after the clock ends (rounds already counted by their taps).
- MS-H3: a client runs a 5 × 1 km interval session with one big button per rep, and the result reads
  "5 × 1 km avg 4:31/km" without typing anything.

---

## 2. Jobs and critical tasks

### Coach
| # | Job (when … I want … so …) | Frequency | Cost of failure | Target |
|---|---|---|---|---|
| C1 | When I plan a Hyrox athlete's week, I want strength, intervals and a race sim in one day's session, so the app runs the session the way I'd coach it | Weekly | Client gets a text blob, no splits, no history | A mixed day built in ≤ 3 min, each part from a picker with defaults |
| C2 | When I've written today's WOD on the whiteboard, I want to paste it and send it, so I don't type it twice | Daily (CrossFit-style) | Coach stops using the app for WODs | ≤ 60 s, ≤ 6 taps, warnings shown before sending |
| C3 | When I want a benchmark (Fran, a 5 km test, a half race sim), I want to pick it, check it, and adapt it | Monthly | Re-typing; wrong standards | ≤ 4 taps to a day; race numbers carry "Check against the current official standard" |
| C4 | When a client logs a WOD or a sim, I want to see the score and how it compares with their own past, so I know what works | Weekly | Generic programming | Score line in history; pattern or win when the data supports it |
| C5 | When I publish a day, I want a short "what this should feel like / how to pace it" draft I can edit, so clients go in with a plan | Per session | AI text reaches a client unchecked | Draft appears in the builder; nothing reaches the client until **Approve** |
| C6 | When my client has a race, I want the date, target and how ready they are in plain dimensions | Per race | Taper missed | Race goal on the client page; readiness in words, no score |

### Client
| # | Job | Frequency | Cost of failure | Target |
|---|---|---|---|---|
| A1 | When I do a WOD, I want the clock running and my rounds counted, then my score saved, so my coach sees it | Per WOD | Score lost or typed wrong | Start in 1 tap; +1 round per round; score saved in ≤ 2 taps after the clock |
| A2 | When I run intervals, I want one big button per rep and my splits kept | Per run session | Splits lost, pace unknown | One tap per rep; result "5 × 1 km avg 4:31/km" |
| A3 | When I do a race sim, I want one Done per segment, like the watch, and my splits | Per sim | Splits lost | One tap per segment, 5 s Undo |
| A4 | When I look back, I want "Fran 4:12" and "AMRAP 20: 7 rounds + 12", not a list of sets | Weekly | No sense of progress | Score in the history row; best and trend in Progress |
| A5 | When I have a race, I want a countdown and to set it myself | Per race | — | Me → Race goal; Today shows the countdown inside 12 weeks |

---

## 3. Navigation and flows: old vs new

### Coach: program builder (day editor)
**OLD**: Programs → program → week → day → a flat list of exercises → "Add an exercise" (library search) → exercise
editor (sets × reps × load). Conditioning faked as time/distance sets. No paste, no templates.

**NEW**: the day is a list of **blocks**. A strength block is the existing exercise list, unchanged (same rows, same
exercise editor, supersets, progression rules). Other blocks are one row each with a kind label and a one-line
description ("AMRAP 20 min · 5 pull-ups, 10 push-ups, 15 air squats").
- **One entry point**, "Add to this session", opens the **block picker** (sheet): *Paste a workout* and *Templates*
  at the top, then block kinds grouped by style, the coach's own styles first, each with defaults filled.
- Picking a kind adds it and opens its **block editor**; picking strength opens the existing exercise search.
- **Removed**: nothing. **Combined**: "Add an exercise" becomes the strength row of the picker. **Moved**: none.
  **Deferred**: drag to reorder (up/down arrows as today), per-block scaling levels (the paste picks one level).

### Coach: paste to program (new)
- From Programs (new "Paste a workout" button) or from the block picker inside a day.
- **One screen**: the text box on top; the parsed preview updates as they type (no "Parse" button); the parser's
  warnings are shown above the preview in amber, each one fixable by editing the text or with the one control it
  needs ("Loads with no unit: kg / lb", default the tenant's units; "Read the level: RX / Scaled").
- Primary: **Send to a client** (from Programs: a sheet with the date and the client list, each row saying what it
  replaces) or **Add to {day}** (from a day). Secondary: "Save as a new program" (from Programs).
- **Removed**: re-typing. **Deferred**: AI reading what the rules can't (the warnings say what to fix instead).

### Coach: templates (new)
- From Programs ("Templates") or the block picker. Search, category chips (your styles first), one row per template
  with its one-line summary. Tap → preview (blocks, verify notes) → **Add to {day}** / **Send to a client**. Adapt by
  editing the blocks afterwards in the day.

### Coach: trainer styles (new, skippable)
- Shown once at the top of Programs as an inline card ("How do you coach? … Choose · Not now"); always in Me →
  Coaching styles. Multi-select: Strength · Hybrid / race-format · Functional fitness (WODs) · Endurance · General
  fitness. **Default: all of them, in that order** (nothing hidden). The choice sets the picker's group order, the
  template categories shown first, and which result charts lead on the client page and in the client's Progress.

### Coach: Strategy & Stimulus (new)
- When a day with conditioning or race blocks is published, an AI draft "What it should feel like / How to pace it"
  appears in the day editor marked **Draft · not visible to clients**, with **Approve** and **Edit**. Demo: a MOCK
  draft. Clients only ever see approved text.

### Coach: race goal (new)
- Client page → "Race" section (after Wins) → **Set race goal** → event, date, kind, division (race-format), target.
  Shows the countdown, the finish estimate with its evidence, and the five readiness dimensions in words.

### Client: logger
**OLD**: log sheet of exercises × sets; one pinned "Log set N" button.
**NEW**: the same log sheet for strength blocks (pixel-identical when a day is strength-only). Each other block is a
section with its kind and lines; when it's the next thing, the pinned button says **Start AMRAP 20:00** /
**Start intervals** / **Start race sim** / **Enter score**. Start opens the **block runner** (full screen, big
numerals, one big button), which ends on **score entry** matched to the scoring mode. Back on the sheet the block
gets the chalk strike and its score.
- **Removed**: faking conditioning as sets. **Combined**: timer and score entry in one flow. **Deferred**: logging a
  scaled level per movement (one "Scaled" switch per score), live GPS pace on the phone (the watch has HR; pace comes
  from distance ÷ time).

### Client: history and progress
- Train → History rows say the score: "Fran 4:12", "AMRAP 20: 7 rounds + 12", "5 × 1 km avg 4:31/km". History detail
  shows each block's result and splits. Progress gets **Benchmarks and times**: each repeated scored block, latest,
  best, and the trend in one sentence.

### Client: race goal
- Me → **Race goal** (set, change, remove). Today: one line "{event} in 23 days" under the date while the race is
  within 12 weeks. Never a score.

---

## 4. Where it sits in the navigation, and why

| Screen | Where | Why there |
|---|---|---|
| Block picker | Sheet from the day editor's single "Add to this session" | The day is where a coach builds; a sheet keeps the day visible behind it |
| Block editor | Pushed on the Programs stack: `/program/[id]/block/[blockId]` | Same level as the exercise editor it sits beside |
| Paste a workout | `/paste` (Programs stack), also from the picker with `?program=&day=` | A CrossFit coach starts from Programs; a builder starts from a day |
| Templates | `/templates` (Programs stack), same params | Same reasoning |
| Coaching styles | Inline card on Programs (once) + Me → Coaching styles | Asked where it pays off (building), never a wall at login |
| Race goal (coach) | Client page section → `/client/[id]/race` | A race belongs to one client |
| Block runner + score | `/session/[id]/block/[blockId]` (logger modal stack, no tab bar) | It's part of doing the session |
| Race goal (client) | Me → Race goal (`/race-goal`); countdown line on Today | Settings live in Me; Today only reminds |

---

## 5. Screen specs

Each: purpose · ONE primary action · what's deferred · states (loading / empty / error / success).

### 5.1 Day editor (changed)
- **Purpose:** what this session is, in order.
- **Primary:** **Done** (unchanged). "Add to this session" is the one secondary.
- **Shows:** name, weekday, note; blocks in order (strength block = today's exercise rows; others one row each);
  Strategy & Stimulus draft card when there is one.
- **Deferred:** drag reorder, block duplication across days (copy day exists).
- **States:** empty ("Nothing in this session yet. Add the first part below."); a block with a problem (row reason
  "Needs attention"); success: toast on add.

### 5.2 Block picker (new, sheet)
- **Purpose:** add a part to the session in one tap with sensible defaults.
- **Primary:** none (a list of choices); the first rows are *Paste a workout* and *Templates*.
- **Groups** (default order; the coach's styles first): Strength (Exercises with sets) · Functional / WOD (For time,
  Rounds for time, AMRAP, EMOM, Rep scheme 21-15-9, Tabata, Interval AMRAP) · Endurance (Intervals) · Race (Race
  simulation: runs + stations) · Other (Timed piece, Rest, Note). Each row: name + one example line.
- **Defaults:** AMRAP 12 min; For time cap 15 min; RFT 3 rounds; EMOM 10 × 1 min; 21-15-9; Tabata 8 × 20/10;
  Interval AMRAP 3 × 4 min / 2 min rest; Intervals 5 × 1 km run, 2 min rest; Race sim 8 × (1 km run + station);
  Timed 10 min; Rest 2 min.
- **States:** only one (static list).

### 5.3 Block editor (new; one screen, fields by kind)
- **Purpose:** set up one part so the client's app can run and score it.
- **Primary:** **Done**.
- **Shows:** a one-line preview at the top ("AMRAP 20 min · 5 pull-ups, …"); title (optional, e.g. "Cindy"); timing
  for the kind (minutes / rounds / work–rest / window / rep scheme / distance or time per rep + rest + target);
  movement rows (name, reps, load in the tenant's unit, calories, distance; tap to edit in a sheet with library
  search); **Scored by** (inferred, changeable: time / rounds + reps / load / reps / distance / calories / not
  scored); time cap; note for the client. Race loads and distances marked to verify show "Check against the current
  official standard".
- **Deferred:** per-movement scaling levels; per-rep targets that differ by rep.
- **States:** a movement not in the library (row tag "Not in your library: logged by name"); invalid timing (field
  error: "Add a time for each rep, or a distance"); removed block (back to the day with Undo).

### 5.4 Paste a workout (new)
- **Purpose:** turn whiteboard text into a session the app can run.
- **Primary:** **Send to a client** (from Programs) / **Add to {day}** (from a day). Disabled with a reason until
  something is read ("Paste a workout first").
- **Shows:** text box; "Read as: AMRAP 20 min" line; warnings (amber, plain sentences from the parser); the
  preview as blocks, with movements not in the library tagged; unit control when a load had no unit (default
  tenant units); level control when several levels were pasted.
- **Deferred:** AI reading; editing blocks here (done in the day after adding).
- **States:** empty (example whiteboard as placeholder, button disabled); nothing readable ("Couldn't find any
  movements" warning); success: toast "Sent to Jordan for Fri 24 Oct · replaces Lower A" with Undo.

### 5.5 Send to a client (sheet)
- **Purpose:** put this session into one client's day.
- **Primary:** tapping a client row sends (one tap each).
- **Shows:** date chips (Today · Tomorrow · next weekday); clients with a program, each with what it replaces
  ("Replaces Lower A" / "Adds it on a rest day"); clients without a program greyed with the reason.
- **States:** no clients with a program ("Assign a program first, then send single sessions").

### 5.6 Templates (new)
- **Purpose:** start from a proven workout and adapt it.
- **Primary:** on the preview, **Add to {day}** / **Send to a client**.
- **Shows:** search; category chips (Benchmarks, Race simulations, Running, Conditioning, Skill, Tests); rows with
  label and summary; preview with blocks and every verify note.
- **States:** no match ("Nothing called “x”. Paste it instead." → Paste); preview with verify notes in amber.

### 5.7 Client logger (changed)
- **Purpose:** do the session and log it without thinking.
- **Primary:** pinned, always the next thing: "Log set 2 · 80 kg × 5" / "Start AMRAP 20:00" / "Start intervals" /
  "Start race sim" / "Enter score" / "Finish session".
- **Shows:** strength blocks exactly as before; other blocks as sections: kind label, title, lines; done blocks
  struck with their score.
- **Deferred:** skipping a block (they can Finish with it unlogged, as with sets).
- **States:** as before (offline banner, resume after kill); a block runner left running resumes from its clock.

### 5.8 Block runner (new; per kind)
- **Purpose:** keep time and count, with one button.
- **Primary (one per kind):** AMRAP / interval AMRAP: **+1 round**; EMOM / tabata / timed / rest: none needed
  (the clock runs; **Done** ends early as quiet); for time / RFT / rep scheme: **Done** (stops the clock);
  intervals: **Done** for distance reps ("Rep 2 of 5 · 1 km"), automatic for timed reps; race sim: **Done** per
  segment with a 5 s Undo.
- **Shows:** the big clock (display numerals ~96 pt), the round / rep / window ("Minute 4 of 10"), what to do now,
  what's next, the target (pace, zone, watts, RPE) for intervals. Pause and End in a quiet row.
- **States:** 3-2-1 lead-in; running; paused ("Paused · Resume"); rest phase (word "Rest" plus the countdown, not
  colour only); capped ("Time cap"); finished → score entry. Resume after the app is killed (clock from saved
  start time).

### 5.9 Score entry (new)
- **Purpose:** save the score in the block's scoring mode.
- **Primary:** **Save score**.
- **Shows by mode:** time ("4:12", prefilled from the clock, editable); rounds + reps (two big steppers, rounds
  prefilled from taps); load (weight stepper in the tenant's unit); reps; distance; calories; "Scaled" switch;
  intervals and race sims show the splits list read-only with the average.
- **States:** time cap hit (switches to reps/rounds: "Capped at 15:00, how many reps?"); invalid time (field error
  "Use m:ss, like 4:12"); saved (back to the sheet with the strike + toast with Undo).

### 5.10 History and progress rows (changed)
- **Purpose:** see results with the right units.
- **Shows:** history row subtitle "Fran 4:12 · 3 lifts" etc.; history detail lists each block's score and splits;
  Progress → Benchmarks and times: "Fran · 4:12 · best 4:05 · 3rd time", trend sentence only with 3+ results.
- **States:** no scores yet (section hidden); one result ("First time logged").

### 5.11 Race goal (coach `/client/[id]/race`, client `/race-goal`)
- **Purpose:** set the race and see how ready they are.
- **Primary:** **Save race goal**.
- **Shows:** event, date, kind (race simulation format / run / other), format + division for race-format, target
  time (optional, "4:12" style); coach view adds the countdown, the finish estimate with evidence lines, and the five
  readiness dimensions (label, reading, one action) without a score.
- **States:** none set ("No race yet. Set one when they enter."); past race ("The race was n days ago"); no
  evidence ("Log one full simulation to see an estimate").

### 5.12 Today (client, changed)
- **Shows:** inside 12 weeks of a race, one line under the kicker: "Spring race in 23 days" (event as typed).
  In the session block: the coach's approved **Strategy & stimulus** next to the deterministic brief ("What it
  should feel like … · How to pace it …", from {coach}). No LLM "today's read".

---

## 6. Coaching styles: what the choice changes (defaults if skipped)

| Style | Picker group first | Templates first | Client Progress leads with | Coach vocabulary |
|---|---|---|---|---|
| Strength | Strength | Benchmarks (lifting) | Lifts (estimated max) | "Session" |
| Hybrid / race-format | Race, Endurance | Race simulations, running | Sim times and stations | "Race sim" |
| Functional fitness | Functional / WOD | Benchmarks | Benchmarks and times | "WOD" |
| Endurance | Endurance | Running | Paces | "Intervals" |
| General fitness | Strength, Functional | Conditioning | Consistency | "Session" |
Skipped = all five in that order. Nothing is ever hidden; order and wording only.

---

# After building

## 7. What shipped

- **Block model** (`core/schemas.ts` `Block`, `core/programs.ts`): a day is an ordered list of parts. Thirteen kinds:
  strength, rounds for time, AMRAP, interval AMRAP, EMOM, for time, rep scheme, tabata, intervals, race simulation,
  timed, rest, note. Each has a scoring mode (time, rounds + reps, load, reps, distance, calories, none) and an
  optional time cap. A plain strength day keeps exactly its old shape: `resolveDay` leaves `blocks` out, so
  `program_snapshot`, the logger, calibration and the watch see no change.
- **Coach builder**: the day editor shows parts in order, each with up / down / remove; **Add to this session**
  opens the picker (grouped by style, the coach's styles first), then a block editor per kind. **Paste a workout**
  reads a whiteboard (warnings in plain words, units default to the tenant's) and sends it to a client for a day or
  saves a program. **Templates**: benchmarks, race simulations, running, conditioning; anything to verify says
  "Check before you send" and every flagged part carries **Check the standard**.
- **Client logger**: a block session lists each part with a **Start** button that names it ("Start AMRAP 12:00",
  "Start intervals", "Start race sim"). One full-screen clock per part: count down (AMRAP, timed), count up with
  rounds (for time, rep scheme), windows (EMOM, tabata, interval AMRAP), intervals with a rest countdown, race
  segments with **Done: SkiErg** and a 5-second **Undo**. Then **Your score**, prefilled from the clock; typed
  counts; "Stopped partway through a round?" chips for AMRAPs.
- **Results** in history ("AMRAP 12: 7 rounds + 10", "Fran 4:13" with round splits, "5 × 1 km avg 4:32/km") and in
  Progress (**Benchmarks and times**, each against the client's own earlier results).
- **Coach client page**: the client's results, race-simulation "where time goes", the race goal with the finish
  estimate (and its evidence) and five readiness dimensions, no score.
- **Patterns for non-lifters** (`core/patterns.ts`): conditioning vs sleep, conditioning trend, aerobic efficiency
  (like with like), compromised running in race sims. **Strategy & stimulus**: AI draft from the blocks only
  (through `redact()`); the coach approves, edits or removes; the client sees only approved text, on Today.
- **Race goal**: coach (client page → Race → Change) and client (Me → Race goal). Today shows "City 10 km in 56
  days" inside 12 weeks.

## 8. Screenshots (every one looked at)

All at 390×844 (phone), light and dark; the coach dashboard also at 1280 wide.
Folder: `/tmp/claude-0/-home-user-spotter-app/9a889125-f33b-523a-af1d-68e997810c05/scratchpad/ms/shots/` (`<set>`
light, `<set>-dark` dark).

| Set | Flow | Screens |
|---|---|---|
| `a` | (a) coach pastes a whiteboard, sends it to Jordan; client Today | Programs, Paste empty, preview, send sheet, sent, client Today |
| `b` | (b) client logs an AMRAP | Today, logger, runner ready / lead-in / rounds, score, score filled, logger done, finish, Train history |
| `c` | (c) client runs 5 × 1 km | Today, runner ready / work / rest, score with splits, logger done |
| `r` | every other runner kind | Fran (count up, rounds, cap), score, EMOM windows, unscored "Nice work", tabata work / rest, typed reps, race sim run / station / Undo pill, race score with 8 splits, history (Fran with 3 round splits, EMOM "Done"), Train, Progress |
| `w` | client race goal + Today | Me row, race goal empty / filled, Today countdown, Today Strategy & stimulus |
| `k` | coach sweep | Programs, coaching styles, day editor, block picker, AMRAP and intervals editors, day with blocks, S&S draft / approved, templates, race-sim preview, Fran, three MOCK clients' pages (results, race), race goal form, coach Today, Me |
| `d` (1280 wide) | coach dashboard | Programs, Paste preview, picker, block editor, day with blocks, S&S draft, templates, Sasha / Ravi results, race goal, Today |
| `x1`–`x6` | earlier flows (copies of `cx`) | still pass |

Console: zero errors on every visited screen (the only output is the existing expo-notifications web warning).

## 9. Timed walkthroughs (headless, demo build)

| Walkthrough | Result |
|---|---|
| (a) Coach pastes a CrossFit-style whiteboard (strength + 3 rounds for time) and sends it to a client for today | **3.8 s, 6 taps** (open Paste, paste, Send to a client, Today, Send to Jordan, Done). The client's Today then shows "Strength + Metcon". |
| (b) Client logs an AMRAP score | Today → clock running: **3 taps** (Start session, Start AMRAP 12:00, Start) + a 3 s lead-in. Clock end → saved: **2 taps** (partial-round chip, Save score). History: "AMRAP 12: 7 rounds + 10". Before the chips and the typed field: 13 taps. |
| (c) Client runs 5 × 1 km intervals | **9 taps in all**: 3 to start, 1 per rep, 1 to save. The rest counts itself down. Saved: "5 × 1 km avg 4:32/km", each rep with its pace. |
| Client sets a race goal | **5 actions, 2.5 s** (open, name, "In 8 weeks", target, Save). Today: "City 10 km in 56 days". |

## 10. Cognitive walkthrough (first-time user)

**Coach, functional-fitness gym, first time on Programs.**
1. *Will they know what to do?* "Paste a workout" sits next to New program, and it's what they already have (a
   whiteboard or notes). Yes.
2. *Will they see the action works?* The preview fills as they type, with "Read as: Strength · Rounds for time".
   Yes.
3. *Will they understand the feedback?* "Loads with no unit were read as kg: 24/16", with the kg / lb switch right
   above. Yes. Movements outside their library are tagged and still work.
4. *Next step?* One primary button: **Send to a client**; then a sheet: Today / Tomorrow / a date, then the client.

**Client, first time a block session appears.**
1. Today says "2 timed parts · about 18 min" and names the parts; the start button names the session.
2. The logger lists the parts; the next one has a filled **Start AMRAP 12:00** button.
3. The clock is the biggest thing on screen; one big button below it changes with the moment (+1 round, Rep 2
   done, Done: SkiErg). Pause and End early are quiet links.
4. The score is prefilled; they only fix it. Risk: a first-timer may not know "+ reps" means reps in the
   unfinished round; the chips under it answer that ("After burpee · +10").

**Coach, first Strategy & stimulus draft.** The draft sits above the parts with a "Draft · clients don't see it"
tag and "Drafted by AI from this session's parts only. Check it before you approve." Approve / Edit / Remove sit
side by side. Clear; the risk is approving without reading (see 12).

## 11. Heuristic issues found, and what happened

| # | Issue | Heuristic | Severity | Status |
|---|---|---|---|---|
| 1 | Logging "+12 reps" took 12 stepper taps; a tabata total of ~120 reps would take 120 | Efficiency | Critical | **Fixed**: typed count fields; partial-round chips |
| 2 | Fran's last round had no split ("Done" stopped the clock but didn't close the round) | Data, consistency | High | **Fixed** in `runnerSplits`, tested |
| 3 | An unscored EMOM showed "8:00" and eight "1:00" splits, reading like a score | Match with the real world | High | **Fixed**: "Done", no splits |
| 4 | Day editor: a part's up / down / remove sat below its divider, looking like the next part's | Grouping | High | **Fixed**: one divider per part |
| 5 | MOCK race target slower than the estimate (1:25:00 vs 1:05) | Credibility | High | **Fixed** (1:04:00) |
| 6 | Interval splits labelled "Round" | Language | High | **Fixed** ("Rep 1") |
| 7 | Paste to a client with no program had nowhere to go | Error prevention | High | **Fixed**: a hidden single-sessions holder per client |
| 8 | Kind chips and number fields overlapped in block editors | Layout | High | **Fixed** |
| 9 | Race-sim runs read "1 km Run" eight times, indistinguishable | Recognition | Medium | **Fixed**: "Run 3 · 1 km", on the clock too |
| 10 | "Rep scheme" kicker for Fran on the client | Jargon | Medium | **Fixed**: "For time · 21-15-9" |
| 11 | Template verify note shown twice (header and each part) | Minimalism | Medium | **Fixed** |
| 12 | Coach page said "your best" about the client | Language | Medium | **Fixed** ("best yet") |
| 13 | "Runs + stations" wrapped in the race kind control | Layout | Low | **Fixed** ("Race sim") |
| 14 | Rounds stepper and "+ reps" field are different heights on the AMRAP score | Aesthetic | Medium | Open |
| 15 | Coach dashboard at 1280 stretches every screen full width | Aesthetic | Medium | Open (app-wide, not this change) |
| 16 | Tabata rest shows the movement, not "Next: …" | Recognition | Low | Open |

## 12. Self-critique: the 10 worst remaining problems

1. **Approve without reading.** The S&S Approve button is as easy as Edit, so a coach could approve a generic
   draft. Today: the AI note and the draft tag. Next: approve per day only, never in bulk (as now), and show the
   draft's first line in the publish toast.
2. **Paste coverage.** Unusual whiteboards (buy-in / cash-out, chipper ladders) come out as a note with a
   warning. It never guesses, but the coach then builds those by hand.
3. **Stepper / field mismatch** on the AMRAP score (issue 14).
4. **Race-sim editor** is a long list of segments; changing division means editing loads one by one.
5. **No audio cues** for EMOM / tabata transitions; the client has to watch the phone.
6. **Backgrounded clock on web:** the runner settles from wall time when reopened, but taps the page never
   received are lost.
7. **Coach dashboard width** (issue 15).
8. **Progress length** for hybrid clients: lifts and benchmarks both stack; the important one isn't always first.
9. **Race readiness** needs sleep / HRV / check-ins for Recovery; without a watch it always reads "No daily read".
10. **Templates** list singles race sims by default; doubles and relay need search.

## 13. Scorecard (1–5)

| Area | Score | Why |
|---|---|---|
| Most important thing findable in ~3 s | 5 | Clock, score or Start is the largest thing on each new screen |
| One primary action per screen | 5 | Every new screen has one filled button |
| Speed of the critical tasks | 4 | 6 taps paste → sent; 2 taps to save an AMRAP; 1 tap per rep |
| Plain language | 4 | "For time · 21-15-9", "Done: SkiErg", "Stopped partway through a round?"; some kind names stay coach jargon |
| Error prevention and recovery | 4 | Undo on laps and saves, paste warnings, verify notes; no audio cues |
| Consistency with the app | 4 | Same tokens, chalk-strike under scores, same sheets and rows; one mismatched control |
| Light / dark | 5 | Every new screen checked in both |
| Trust (no invented numbers, MOCK labelled) | 5 | Self-comparison only; MOCK on demo names; AI drafts marked |

All Critical and High issues are fixed.
