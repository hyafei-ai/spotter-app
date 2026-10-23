# Spotter — Art direction

Source: *Spotter — Product & Engineering Requirements* (Oct 17, 2026). That document already fixes the type, colour tokens and avoid-list; this note records the reasoning behind them and the decisions that were left open. Anything marked **CLIENT INPUT REQUIRED** is a gap, not an assumption.

## 1. Classification

**Health / fitness — strength-coaching tool, with a B2B companion side (the coach app).**

The fitness row of the vertical table suggests "motivating, warm, energetic". Spotter takes *warm* and leaves *energetic* alone. The client app is used in a gym, between sets, often with chalky hands and a raised heart rate. That person needs to see the next number fast, not be hyped up. The coach app follows the "productivity companion" row: dense but clear, and status changes have to read as confirmed.

## 2. Product understanding

| | Client | Coach (owner / assistant) |
|---|---|---|
| Trigger | Arrives at the gym; push from coach | Morning or between sessions; push "check-in submitted" |
| Context | One hand, standing, sweaty, poor signal, 60–180 s between sets | Phone, 2–5 min windows, sometimes web for program building |
| Job | Know what to do next, log it in seconds | See who needs me today, act from my phone |
| Core loop | Open → Start session → set: read target → log → rest → … → Finish | Open → top "needs you" row → act (reply / review / approve) → mark handled → next |
| First-session goal | Intake, waiver and first logged set in ≤ 3 min | First client invited, first program assigned |
| Trust triggers | Coach's own words and face; numbers that are really theirs; never losing a set | Nothing AI reaches a client without their tap; payouts in their own Stripe account |

**Five-second message, client Today:** "This is *today's session from my coach*, and this button starts it."
**Five-second message, coach Clients:** "These are the people who need me, and why."

## 3. Feel

Using Spotter should feel **grounded, coach-present, quick and honest**:

- *Grounded*: a paper training log, not a neon dashboard. Warm neutrals, condensed numerals, hairline rules.
- *Coach-present*: the coach's name, monogram and own sentences appear where a generic app would put marketing copy (welcome, session note, rest-day line, empty states).
- *Quick*: one primary action per screen; a set logs in a single tap when the client did what was prescribed.
- *Honest*: every number on screen was logged by someone. No streaks, rings or invented PRs.

## 4. Product-specific character (recognisable with the logo removed)

1. **The log sheet as the main surface.** Sets are rows on a ruled sheet (target · previous · entry), the way lifters already write in notebooks. No card per exercise. Reason: people compare against last week's numbers, and a sheet keeps those numbers side by side.
2. **Condensed numerals carry the hierarchy.** Barlow Condensed 700 at 40 pt for weight × reps. The numbers are the hero, not illustrations. Reason: a client reads the number from arm's length while holding a bar.
3. **The coach's voice in the slots that usually hold generic copy.** Welcome, session note, rest day, empty states and the "all clear" coach state are all written by the trainer. Reason: clients pay for a person, and white-label only works if the app sounds like that person.

## 5. Signature detail: the chalk strike

When a set is logged, a short hand-drawn stroke crosses the row (an SVG path drawn over 260 ms with `strokeDashoffset` via Reanimated) with a success haptic, like a tally on a gym whiteboard. On Finish, the strikes for the session close into a tally (groups of five: four uprights and a diagonal), which is also the only "celebration" in the app. It is used nowhere else. With Reduce Motion on, the stroke appears fully drawn at once and the haptic still fires.

## 6. Avoid-list (project-specific)

From the spec, and treated as hard rules:

- Purple/blue gradients, glow, glassmorphism.
- A Today dashboard of equal stat cards; progress rings; streak flames; fake charts.
- "Good morning, Alex" headers. Today's header **is the session name**.
- Three-slide onboarding carousels; a floating action button on every screen.
- Neon-on-black dark mode. Dark is warm charcoal (#171614) with warm off-white ink.
- UI-kit default styling. No default RN `Button`, no Material ripples on brand surfaces.
- Invented testimonials, ratings, user counts or results, including store listings and demo data.

Added for this product:

- **No cards around exercises.** Hairlines only; cards only for grouped, tappable things (a due check-in).
- **No celebratory confetti or badges on PRs.** A PR is shown as a plain line on the finish screen, and only when a prior logged set exists to beat.
- **No colour-only state.** Every logged set has the strike *and* the "Logged" accessibility state; every sync state has words.
- **No brand colour on large fills.** Brand appears on the primary button, the strike, focus rings and the monogram. Warm neutrals do the rest, so any trainer's colour looks deliberate.

## 7. Platform conventions

- **Native:** tab bar, stack back behaviour (swipe on iOS, system back on Android), system alerts/permission prompts, keyboard handling, safe areas, share sheet.
- **Brand:** accent colour, monogram, typography, the strike, haptic pattern, microcopy, empty states.
- Steppers are custom (the system stepper is too small for gym use) but expose `adjustable` accessibility actions so VoiceOver/TalkBack can increment and decrement.

## 8. Navigation & screen inventory

**Client** tabs: Today · Train · Body · Coach · Me (Oct 2026, `docs/ux/client-experience.md`; History lives in Train). Nutrition, check-ins and form checks open from Today's due list or from a set row, never as extra tabs. The logger is a full-screen modal stack with no tab bar.

**Coach** tabs: Today · Clients · Programs · Grow · Me (Today since Oct 2026, `docs/ux/coach-experience.md`). Client detail and form-check review push onto the Clients stack.

| Flow | Screens |
|---|---|
| First run | `/(auth)/welcome` → `/(onboarding)/intake` → `/(onboarding)/waiver` → notification permission (with reason) → `/session/[id]` |
| Core loop | `/(tabs)/today` → `/session/[id]` → `/session/[id]/finish` → Today (done state) |
| Coach triage | `/(tabs)/clients` → `/client/[id]` → reply / mark handled → back with the row gone |

## 9. Design system

Tokens are exactly as specified (see `packages/ui/src/tokens.ts`), with two additions:

- `brandInk`: text colour on brand fills, computed (white or ink) for ≥ 4.5:1.
- `strike`: the chalk-strike colour, equal to brand in both modes.

Spacing is a 4-pt scale, with 20-pt screen margins, rows ≥ 56 pt and targets ≥ 44 pt / 48 dp. Radius is 6 for controls and 10 for sheets. Icons are Feather only. Motion is 180 ms ease-out, and the strike is 260 ms. Haptics: success (set logged), warning (sync failed), selection (stepper). Nothing else.

## 10. Screen grammar

1. **Log sheet:** ruled rows with columns, used by the logger and history detail.
2. **Focused task:** full screen, one primary button pinned to the thumb zone, used by the logger, waiver and finish screens.
3. **Reason list:** rows whose secondary line is a plain-language reason, used by coach triage and the Today due list.
4. **Form, one action:** intake and check-in.
5. **Detail:** a header block, then hairline sections, used by client detail and Me.
6. **Empty state:** one sentence in the coach's voice plus one action.

## 11. Screen states shipped in this build

| Screen | States implemented |
|---|---|
| Welcome | default, invalid/expired invite |
| Intake | default, PAR-Q flag message, partial (resume later) |
| Waiver | empty signature (button disabled with reason), signed, offline (saved on phone) |
| Today | session, rest day, no program yet, session done, skeleton |
| Logger | default, offline banner, sync failed + Retry, suggested load, rest timer running, resume after kill |
| Finish | real PRs, no PRs |
| History | list, empty |
| Coach thread | empty, queued offline |
| Me | default, billing problem banner |
| Coach Clients | needs-you list, all clear, no clients yet, skeleton |
| Client detail | default, flags (PAR-Q / payment / paused) |

## 12. Anti-generic review (applied before build)

| Where | Risk | Fix applied |
|---|---|---|
| Today | Drifting toward "summary cards" (sessions this week, volume) | Removed. Today shows the session and the due list only, and weekly numbers live in History. |
| Finish | Temptation toward confetti or a trophy for PRs | The tally close is the only celebration, and PRs are text rows. |
| Welcome | A hero illustration slot | Replaced with the coach's monogram/photo and their own welcome text. |
| Coach Clients | Avatar grid | A list with reason lines, sorted by priority. |
| Empty states | Generic illustrations | One sentence plus one button, no image. |
| Dark mode | Pure black with saturated brand | Warm charcoal, with the brand lightened (#F07A3E) for contrast. |
