# Spotter physiology layer — UX review and recommendations

Internal working document (Oct 2026). Produced with the app-ux-improvement method. Personas, journeys and walkthroughs
are **design hypotheses written by AI, not research findings**. Nothing here has been tested with real athletes,
coaches or owners yet.

## 1. Executive summary

Spotter's bet is that one read across training, recovery, fuelling and the menstrual cycle, shared between athlete, coach
and owner, keeps women 35+ training. The core UX challenge is **trust before insight**: the product asks for the most
sensitive data an athlete has (cycle, food, pain) and can only pay it back after weeks of history. So the design strategy
is:

1. **Zero re-entry.** Everything already in Apple Health / Health Connect (sleep, HRV, resting HR, workouts and runs, food
   from MyMacros and similar, period logs) flows in. Spotter is where the read happens, not another logging app.
2. **Useful on day one.** Backfill 28 days of Health history at connect, so the brief and baselines work immediately;
   say honestly what still needs time (cycle calibration needs about two cycles).
3. **One engine, three lenses.** The same read, shown as a daily brief to the athlete, "between sessions" to the coach
   (only what was shared), and money-and-engagement to the owner (never health).
4. **Show the evidence.** Every suggestion names its data and how sure it is. No scores to athletes.

Top recommendations, in order: Health connect as onboarding step with a "what we found" preview (R1); the brief as the
centre of Today (R2); a single "Who sees what" privacy panel (R3); honest calibration progress (R4); workout and food
import with dedupe (R5, R6); a watch app focused on the session and the morning glance (R8).

## 2. Product understanding

**Facts provided (by the product owner)**
- Users: women athletes 35+ (trainees), their coaches/trainers, gym or business owners.
- Problem framing: under-fuelling (RED-S), cycle-blind programming, accumulated load and injury, stalled raw PRs.
- Moat as stated: cycle-phase performance calibration (provisional patent in preparation); three-sided architecture;
  cross-domain data engine; switching cost.
- Planned: a watch app redesigned from the owner's existing one; nutrition and workouts imported via Apple Health so
  clients don't re-enter.
- Feature names used: retention-intelligence engine, AI Strategy & Stimulus briefs, cycle-aware fuelling.

**Reasonable assumptions**
- Most athletes in the segment use an iPhone and many an Apple Watch; Android is secondary.
- Coaches are 1:1 or small-group online/hybrid; owners run a gym or a coaching business with several coaches.
- Athletes already log food in another app if they log at all.

**Hypotheses to validate**
- H1: athletes will share cycle phase with a coach if they see exactly what's shared and can stop any time.
- H2: a calibrated "strongest late-luteal squat yet" keeps motivation when raw PRs stall.
- H3: coaches act on a between-sessions flag within a day when it comes with "what to ask".
- H4: owners act on MRR at risk when the reason and the coach to ask are one tap away.

**Claims to check before using externally**
- "No commercial fitness app segments baselines by cycle phase": several apps do cycle-related training or nutrition
  guidance (e.g. Wild.AI, FitrWoman; Whoop, Oura, Garmin and Apple have cycle features). The likely-defensible part is
  *per-athlete performance calibration from the athlete's own lifting data* plus the coach and owner loop. Worth a
  proper competitor and prior-art check alongside the patent filing.
- Drop-out rate figures in the brief: keep them out of the app UI unless a source is cited.

## 3. Behavioral personas (hypotheses)

| Persona | Goal | Context | Pain today | Abandonment trigger | Success |
|---|---|---|---|---|---|
| **The returner** (38–50, back to lifting after kids/career) | Get strong without getting hurt | Trains 3×/wk before work; Apple Watch; logs food on and off | Sore for days, unsure if it's age, cycle or programming | Second injury in a year; a month of no progress | Training 12+ months, knows when to push |
| **The perimenopause lifter** (44–55) | Understand why sleep and strength changed | Irregular cycle, night sweats; tracks in Apple Health | Apps assume a 28-day cycle or ignore it | App that says "log your period" when there isn't one | Brief that makes sense without a regular cycle |
| **The under-fueller** (35–45, endurance + lifting) | Perform; often eats "clean" and too little | Runs logged by Watch/Strava, lifts with coach | Fatigue, missed periods, repeat niggles, doesn't connect them | Being told to "eat more" without why | Sees the link, gets a specific fix, maybe sees a dietitian |
| **The coach** | Not drop the ball between sessions | 15–40 clients, phone first | Finds out about problems at the next session | Another dashboard to check | 30-second prep, flags with "what to ask" |
| **The owner** | Keep members | Weekly look, desktop | Learns of a cancellation when it happens | Vanity analytics | A name, a reason, a coach to hand it to, and money kept |

## 4. Jobs to be done (extending docs/jtbd.md)

- Athlete, functional: *When I wake up tired, I want to know why and what to change today, so I train instead of skipping.*
- Athlete, functional: *When my lifts dip, I want to know if it's my cycle, sleep, food or load, so I don't think I'm going backwards.*
- Athlete, emotional: *When my body changes in my 40s, I want to feel understood, not managed like a 25-year-old.*
- Athlete, functional: *When I've logged food or a run elsewhere, I want Spotter to already have it, so I don't log twice.*
- Coach: *Between sessions, I want to see what each athlete chose to share, so I adjust the plan before something breaks.*
- Coach: *When I write a block, I want to say what each session is for (the stimulus), so the athlete can adjust it sensibly on a bad day.*
- Owner: *Each week, I want to see who might leave, why (without their health details), what it's worth, and which coach to ask.*

## 5. Critical tasks

| # | User | Task | Frequency | Cost of failure | Type | UX priority |
|---|---|---|---|---|---|---|
| T1 | Athlete | Read today's brief and pick planned / easier version | Daily | Overtraining or skipping | Primary | 1 |
| T2 | Athlete | Connect Apple Health (sleep, HRV, workouts, food, periods) | Once | Cold start; double entry; churn in week 1 | Primary (setup) | 2 |
| T3 | Athlete | Log a session with calibrated loads (phone or watch) | 3×/wk | Wrong loads, distrust | Primary | 3 |
| T4 | Athlete | Decide what to share with the coach | Once + any time | Loss of trust; privacy harm | Primary (setup) | 4 |
| T5 | Coach | Prep and act on a between-sessions flag | Daily | Missed injury/RED-S signs | Primary | 5 |
| T6 | Athlete | Act on a fuel check result | Weekly | RED-S progression | Secondary | 6 |
| T7 | Owner | Review MRR at risk and hand to a coach | Weekly | Preventable cancellation | Primary (owner) | 7 |
| T8 | Athlete | Log pain / return from a niggle | Occasional | Injury | Exception | 8 |

## 6. Key journeys (condensed)

**Athlete, first week (T2 → T1)**
1. *Invite → onboarding.* Question in mind: "what will my coach see?" → Show the privacy promise before asking for anything.
2. *Connect Apple Health.* One permission sheet for sleep, HRV, resting HR, workouts, nutrition. Cycle permission asked
   **later**, only when cycle tracking is turned on. System response: "Found 28 nights of sleep, 9 workouts (6 runs from
   Apple Watch), food from MyMacros on 19 days." Emotional state: relief ("I don't have to start from zero").
3. *First brief, same day.* Uses backfilled baselines. Says what it doesn't know yet ("Cycle calibration: learning, 0 of 2 cycles").
4. *First session.* Planned loads; one line explains if anything's adjusted and why.
5. *Exception:* Health denied or empty → the brief runs on the 30-second check; a quiet row offers to connect later.
   iOS never reports read-denial, so show "No data yet", never "denied".

**Coach, a Tuesday (T5)**
Clients → "Needs attention" (3) → client → "Between sessions" (running tired 4 of 7 days; fuel check: worth a look;
shared) → "What to ask" → message, or adjust the lighter rule → mark handled. Target: under 30 seconds to a decision.

**Owner, Monday (T7)**
Retention → MRR at risk (per currency) → member row ("Coach flagged something worth a check-in"; "No session in 12
days") → Hand to coach → 60 days later "Kept: $1,560/yr".

## 7. Flows: current vs recommended

**Nutrition (T2/T6)**
- CURRENT: Nutrition tab → search food → amount → log. Athletes already logging in MyMacros must double-enter.
- NEW: Connect Apple Health once → food totals appear per day with "From MyMacros via Apple Health" → Fuel check
  uses them → Spotter logging stays optional. *Removed:* re-entry. *Rule:* per day, one source only (Health, else
  Spotter), never summed, since many apps write the same food to Health.

**Workouts (T1/T3)**
- CURRENT: only Spotter sessions count toward load.
- NEW: Apple Watch / Fitness / Strava workouts imported from Health count toward load, region load (runs → knee,
  ankle, foot, hip) and the brief. A workout overlapping a Spotter session is the same session (Spotter's wins, HR and
  kcal attached). History shows "Run · 5.2 km · from Apple Watch".

**Daily read → brief (T1)**
- CURRENT: tone + factor list.
- NEW: "You're running tired today" → Here's why (≤3, each naming its data) → Here's what to do (≤3) → planned /
  easier version. *Moved:* cycle phase becomes context for calibration, never a "strain" factor.

## 8. UX audit findings (master table)

| ID | Where | Problem | Sev | Recommendation | Status |
|---|---|---|---|---|---|
| F1 | Onboarding | Health connect isn't part of setup; baselines start empty | High | R1: connect step with backfill and a "what we found" preview | Building (brief build) |
| F2 | Nutrition | Double entry for athletes using another food app | High | R6: Health nutrition import, one source per day | Building (fuel + brief builds) |
| F3 | Load | Runs and classes outside Spotter don't count → load spikes and injury risk under-read | High | R5: workout import with dedupe | Building (brief build) |
| F4 | Cycle | Manual phase picker assumes the athlete knows the phase; fails for peri/irregular/hormonal | High | Estimated phase from period logs (Health import) and 7 modes incl. pregnant/postpartum | Building (cycle build) |
| F5 | Privacy | Sharing settings spread across daily check, cycle, fuel, pain | High | R3: one "Who sees what" panel, linked from each toggle | Proposed |
| F6 | Calibration | Nothing tells the athlete it's still learning | Medium | R4: "Learning your cycle: 1 of 2 cycles" and what it'll do when ready | Building (cycle build) |
| F7 | Fuel screen | A missed period during pregnancy or on some contraception would false-flag | High | Mode-aware screen; pregnant/postpartum mode pauses it | Building |
| F8 | Owner | Risk reasons could leak health information | Critical | Owner view strips health reasons → "coach flagged something" | Building (at-risk build) |
| F9 | Web dashboard | Sidebar cramped at phone width | Medium | Collapse to a top bar ≤640px | Building (at-risk build) |
| F10 | Coach | Briefs say what's wrong but not what the session is *for* | Medium | R7: Stimulus line per session | Proposed |

## 9. Information architecture (proposed)

Athlete tabs: **Today** (brief → session → due items) · **Train** (program, history incl. imported workouts, progress) ·
**Fuel** (day totals from Health or Spotter, fuel check; hidden when the module is off) · **Coach** (thread) · **Me**
(Health connections, Your cycle, Pain, **Who sees what**, settings).

Coach: Clients ("All / Needs attention") → client (Before you talk, Between sessions, Today's brief, Cycle and Fuel if
shared, Pain, Remember) · Inbox · Programs · Me (owner-only Retention).

Owner web: Dashboard → Retention (MRR at risk, members to talk to, kept) · Members · Coaches · Billing.

## 10. UX writing (key strings)

| Current / risk | Recommended | Why |
|---|---|---|
| "Readiness 62" (common pattern) | "You're running tired today" | Plain words, no score |
| "Luteal phase: reduce load" | "Late luteal: your lifts usually run about 3% lower here (your own data, 5 cycles). Loads 3.5% lighter today. Use planned loads instead" | Evidence, personal, reversible |
| "Low energy availability detected" | "Eating under what training needs on 4 of the last 7 days" | Describes, doesn't diagnose |
| "RED-S risk" | "Worth booking a doctor or sports dietitian. Bring this screen, your period dates and recent injuries." | Action, not label |
| "At risk of churn" (coach) | "Needs a check-in soon" | Coach job language |
| "Connect" | "Connect Apple Health: sleep, workouts, food" | Says what happens |

## 11. Domain-specific UX

**Daily brief.** States: no data (check-in prompt) · partial (says which sources are missing) · full · stale (Health
not synced since yesterday: shows time). At most 3 reasons and 3 actions. Phase is context. Every action is doable today.

**Cycle-phase calibration (the moat).** States: off · learning (n of 2 cycles, per phase sessions) · ready (per-phase
table) · paused (mode change, pregnancy, contraception change resets the learning, with a note) · disagreeing (athlete
says "felt strong" repeatedly when the app eased → shrink the adjustment; show "You've overridden this 3 times; the
app has adjusted"). The method is swappable behind the `Calibrator` interface, so the patented method drops in
without UI change.

**Cycle-aware fuelling.** Training-day targets rise with the session; before a planned heavy session, a gentle
pre-fuel nudge (time-based, opt-in); in the late luteal phase, wording acknowledges appetite often runs higher, as
common experience, not a rule. No weight-loss framing anywhere.

**AI Strategy & Stimulus briefs (proposed; meaning to confirm).** Our reading: *Strategy* = the coach's intent for the
block or week ("build squat volume; deload week 4"), drafted by AI from the program and the athlete's shared data,
**approved by the coach** (same draft-and-approve pattern as AI program drafts). *Stimulus* = one line per session saying
what it's for ("heavy strength: top sets at RPE 8") so the brief can modify it sensibly ("today keep the top set,
drop the back-off sets"). The athlete sees only coach-approved text.

**Retention-intelligence engine.** Owner: MRR at risk per currency, trend, top reasons (owner-safe), hand to coach,
kept value. Coach: the same engine produces "needs a check-in" with physiology reasons the athlete shared. One engine,
two privacy lenses.

**Apple Watch companion (redesign of the owner's existing app).** Don't port the phone app. Three jobs only:
1. *Morning glance:* complication + notification with the brief's feel line and one action ("Easier version today").
   Quick 3-tap check-in (energy, soreness, stress) with the crown.
2. *In session:* current exercise, set n of m, calibrated target load and reps, rest timer with haptic, log reps and RPE
   with the crown, heart rate. Works offline; syncs through the phone.
3. *Coach messages:* read and reply with dictation or quick replies.
Needs: the existing watch app's code, and a native build pipeline (Xcode / EAS with a watch target). Can't be built or
verified in this environment.

**Cross-domain data engine.** "Sharpens with every athlete" should mean **better starting points**, not pooled personal
data shown to anyone: cohort priors (e.g. typical first-cycle adjustment for athletes in the same mode) that each
athlete's own data quickly overrides. Requires a separate, opt-in research consent, de-identification, and a plain
explanation. Health-data laws for apps (e.g. the FTC Health Breach Notification Rule, Washington's My Health My Data
Act) apply to cycle and food data; get counsel before pooling.

## 12. Edge cases

| Trigger | What the user sees | Recovery |
|---|---|---|
| Health access granted but empty (or silently denied on iOS) | "No data yet from Apple Health" + how to check Settings | Brief runs on the check-in |
| Same food in MyMacros and Spotter | Day shows one source, "Also logged in Spotter: not added twice" | Switch source per day |
| Watch workout + Spotter session at same time | One session with HR and kcal attached | "Not the same? Split" |
| Contraception started / stopped | Calibration paused, "learning again" | Previous calibration kept in history |
| Pregnant / postpartum | No phases, fuel screen ignores periods, calibration paused | Mode change any time |
| No period 90+ days in natural mode | Fuel check: talk to someone | Mode picker if it's menopause/contraception |
| Illness | "Sick?" in check-in pauses load and progress stall rules | Auto-resume after 3 days |
| Athlete stops sharing | Coach sees "kept private" from now; history already shared stays per policy (decide) | — |
| Athlete leaves the coach | Their data stays with the athlete; the coach loses access | Export available |
| Offline in the gym | Calibrated loads computed on device; queue syncs later | Sync banner |

## 13. Improvement roadmap

**A. Structural UX**

| ID | Recommendation | Persona | Priority | Effort | Status |
|---|---|---|---|---|---|
| R1 | Health connect in onboarding, 28-day backfill, "what we found" | All athletes | Critical | M | In build |
| R2 | Brief at the top of Today; planned vs easier choice beneath | All athletes | Critical | M | In build |
| R3 | "Who sees what" single privacy panel | All athletes | Critical | S | Proposed |
| R4 | Calibration learning state and override learning | Returner, peri | High | S | Partly in build |
| R5 | Workout import with dedupe and region load | Under-fueller, returner | High | M | In build |
| R6 | Nutrition from Health, one source per day | Under-fueller | High | M | In build |
| R7 | Stimulus line per session + coach-approved AI strategy | Coach, athlete | High | M | Proposed (confirm meaning) |
| R8 | Watch: glance, in-session logging, coach messages | Athletes with Watch | High | L | Needs existing watch code |
| R9 | Owner MRR at risk with health-free reasons | Owner | High | M | In build |
| R10 | Illness / travel mode in the check-in | All athletes | Medium | S | Proposed |
| R11 | Cohort priors with research consent | All | Medium | L | Proposed (legal review) |

**B. Visual/UI**: brief typography (feel line as the one big line); per-phase table readable without colour; MRR
numbers per currency with trend as text + sparkline; watch layouts at 41/45/49 mm.

## 14. Open questions

For the product owner:
1. What do "AI Strategy & Stimulus briefs" mean in the other app? (Our reading is in §11.)
2. Can we have the existing watch app's code (repo or archive), and is it SwiftUI?
3. Pricing: is cycle calibration in every plan, or a premium tier?
4. Sharing default for pain: on (coach needs it) or off (privacy first)?
5. When an athlete stops sharing, does the coach keep what was already shared?

For real users (first study, 5–8 athletes, 3 coaches): H1–H4 above; does "your lifts run ~3% lower here" feel
validating or limiting?

Technical: HealthKit nutrition and menstrual-flow reads, workout import, and the watch app need a device build to verify.

## Deliverables index

| Deliverable | Audience | Internal/stakeholder | Status | Format |
|---|---|---|---|---|
| This review (strategy, personas, JTBD, flows, audit, roadmap) | Team | Internal | Draft v1 | Markdown in repo |
| docs/physiology.md (product brief and ground rules) | Team, stakeholders | Both | Done | Markdown |
| Feature docs (cycle, fuel, brief, at-risk) | Developers | Internal | In build | Markdown |
| Working prototype (web preview) | Stakeholders, testers | Stakeholder | Updating after builds merge | Vercel link |
| Watch app redesign spec + screens | Team | Internal | Waiting on existing code | Figma or SwiftUI |
| Stakeholder summary | Investors / client | Stakeholder | Not started | PDF |
