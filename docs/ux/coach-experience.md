# Coach experience: Today, what works, all clients at once (UX record, Oct 2026)

App-ux-improvement pass for the coach app rebuild that makes `docs/ux/first-value.md` true: a trainer logs in and
sees the value in the first minute. Walkthroughs and scores are design judgements written by AI from screenshots of
the demo build, not user research. All demo data is MOCK.

## 1. The coach's job and the critical tasks

**The sentence a trainer should repeat after 60 seconds:** "It shows me what actually works for each of my clients."

From `docs/jtbd.md` and the product owner (Oct 2026): the trainer is the buyer. They want every client's data in one
place (logged and imported workouts, sleep, HRV, resting HR, mobility, food, the cycle only when shared) and, per
client, what works, what doesn't, how much recovery they need and what's missing. With 50+ clients they need
reasons to praise people that aren't PRs.

| # | Task | Frequency | Cost of failure | Target |
|---|---|---|---|---|
| T1 | First login: understand what Spotter does | Once | Trainer churns in the trial | ≤ 10 s to the first insight |
| T2 | Invite the first client | Once, then weekly | No data, no value | ≤ 3 taps from Today |
| T3 | Morning: who needs me today, and the one thing to do | Daily | Heavy day on a wrecked client; a quiet client drifts off; a win goes unsaid | ≤ 30 s, one tap per item |
| T4 | Learn what works for one client and keep it | Weekly per client | Generic programming | The top pattern readable in 3 s on the client page |
| T5 | See what happened over the last weeks | Before a session / check-in | Guessing | One timeline, all lanes aligned, tap a day |
| T6 | Scan everyone at once | Weekly | Missing a slow slide | 14 days × all clients on one phone screen |
| T7 | Share a win | A few times a week | Clients past 40 lose motivation | One tap to a prefilled message |

## 2. Navigation and flows: old vs new

**OLD**
- Tabs: **Clients** · Programs · Grow · Me. Login lands on Clients → "Needs you".
- Clients chips: Needs you · All · Check in · New · Paused · Payment issue. "Needs you" mixed operational items
  (payment, PAR-Q, form check, messages) with body and engagement reasons (short sleep streak, load spike, fuel, pain,
  missed sessions, quiet for a week) that the Check in list also showed.
- Client page: header → prep card → **Needs you** (+ Mark handled) → Between sessions / **Check in card** (+ I checked
  in) → This week → Recent sessions → Program → Form checks → Check-ins → AI → Nutrition → Payments → Today's read →
  Pain → Remember → Cycle → Fuel → notes → intake. Patterns and wins existed in core but had no UI. No chart of
  anything over time.
- No sample client: a new coach with no clients saw "No clients yet".
- Invite success: a QR code and a link, nothing about what happens next.

**NEW**
- Tabs: **Today** · Clients · Programs · Grow · Me. Login lands on **Today**.
- **Today** (new home): three groups, most important first, at most 3 rows each with "See all":
  1. **Act today**: today's planned session meets a strain signal (short sleep + HRV under usual + a heavy day;
     ongoing pain + a day that loads that area; a fuel flag on a training day). One action: **Offer the easier
     version** (a sheet: the message to send, and "Edit today's session myself").
  2. **Check in**: from the Check in list (`athleteDropoutRisk`). One action: **Message {name}**, prefilled with the
     question to ask; sending it logs the check-in.
  3. **Celebrate**: `winsToMention`. One action: **Send to {name}**, prefilled.
  - "All good today" state with a win to share. A quiet line under the groups: "Also waiting: 2 messages · 1 form
    check · 1 payment" → Clients → Needs you.
  - No charts.
- **First login**: a clearly labelled **Sample client (MOCK)** with 16 weeks of data and patterns, and a banner on
  Today: "This is what you'll see for every client. Invite your first one." with **Invite** as the primary action.
  Demo: Me → Demo → "Show first login", or `/coach-app/today?firstrun=1`.
- **Client page**, in the order a coach thinks: **what works** (playbook) → **what's happening** (8-week timeline,
  wins) → **what to do** (check-in card, waiting items, program, then the existing sections).
- **Clients → List / Grid**: the grid is every client × the last 14 days.
- **Invite success** adds "What you'll see next" and, in the demo, "See a connected client" (the sample client in
  its just-connected state).

**Removed:** "Mark handled" on the client page; body and engagement reasons from "Needs you" (they live in Act
today and Check in only); the prep card at the top of the client page (moved under the check-in card).
**Combined:** the three ways of seeing who needs you (Needs you, Check in, reads) into Today's three groups.
**Moved:** login landing from Clients to Today; the prep card below the check-in card.
**Deferred:** a web dashboard version of Today and the grid (the coach app runs on web already at 390–1280 px);
coach-written playbook entries syncing to the server (local store now, `TODO-INTEGRATE`); share-card images (client
side, the other builder's).

### Decision: one way to close each kind of item (issue #3 of coach-owner-restructure)

There are two kinds of thing a coach closes, and each now has exactly one close:

| Kind | Examples | Closed by | Records |
|---|---|---|---|
| **Waiting on you** (a to-do) | unread message, form check, payment failed, PAR-Q flag, check-in submitted, follow-up due, new client | **Done** on Clients → Needs you (swipe or the row's menu); replying or reviewing also clears it | nothing beyond the tick |
| **A check-in** (a conversation) | everything on Check in | **Sending the message** from Today (logged as a check-in "by message"), or **I checked in** on the client page for a call or in person | a check-in, which feeds Keeping clients |
| **Today's session** | Act today items | **Sending** the easier-version offer or the prefilled message | moves to "Done today" (not a check-in: the client isn't drifting, their day is hard) |

The waiting close is named **Done** everywhere (the Clients swipe, the row menu, the client page's "Waiting on you"),
replacing "Mark handled". "Done" never appears next to a check-in, and a check-in can't be closed without being
recorded. The team case is unchanged: a head coach's request to an assistant closes through "How did you check in?".
Every Today item can be put back from "Done today" with Undo.

### Decision: what happens to the "Needs you" triage list (issue #2)

**Kept as the Clients filter, narrowed to waiting items.** Rationale: Today is about the client's body and behaviour,
which is what Spotter alone knows and what the sentence promises; the inbox (messages, form checks, payments) is a
queue the coach already understands and clears in batches. Folding the inbox into Today would push "Jordan slept 5
hours and has a heavy day" below "Priya's card failed". Today links to it in one quiet line, so nothing is lost. The
body and engagement reasons (`missed_sessions`, `churn_risk`, `sleep_short_streak`, `load_spike`, `fuel_pattern`,
`pain_ongoing`) are filtered out of Needs you because Check in and Act today already say them in one vocabulary:
the same fact is never shown twice.

## 3. Screen specs

### Today (`/(tabs)/today`, the first tab)
- **Purpose:** who needs me today and exactly why, each with the one thing to do.
- **Primary action:** per item, one button; the screen's primary is the first Act today item's button.
- **Shows:** date line; up to 3 rows per group (avatar, name, one plain line with the why, one button); "See all n";
  "Also waiting" line. Done items collapse into "Done today (n)".
- **Deferred:** charts and patterns (client page), the inbox (Clients → Needs you), money (Keeping clients).
- **States:** loading (three skeleton rows); all good ("All good today. Here's who's doing great" + one win with
  Send); error (Check in list failed: "Couldn't load who to check in with" + Try again, other groups still show);
  first run (banner + sample client items, each labelled Sample); success (toast "Sent to Jordan · check-in logged"
  with Undo, the row moves to Done today).

### First run (Today with no real clients)
- **Purpose:** show in 10 seconds what Spotter does, on a realistic client, without pretending it's real.
- **Primary action:** **Invite your first client**.
- **Shows:** the banner sentence; the sample client's Act today and Celebrate rows labelled "Sample"; "Open the sample
  client" link. Clients shows only the sample client with a Sample tag.
- **States:** shown whenever the roster has no clients (connected) or in the demo toggle; disappears once a real
  client exists.

### Client page (`/client/[id]`)
- **Purpose:** what works for this client, what's happening, what to do.
- **Primary action:** footer **Message {first}** (unchanged).
- **Order:** header (name, plan, tags, injury note) → connected banner (just connected) → **What works for {first}**
  (top 3 patterns: title, confidence in words, one-line detail, Pin / Dismiss; pinned playbook entries first; "Add
  your own note") → **Last 8 weeks** timeline (lanes: training incl. imported, sleep vs usual, HRV vs usual,
  mobility, food vs target, cycle band only if shared, pain markers; tap a day for its details; 4/8-week switch) →
  **Wins to mention** (Send) → Check in card / Between sessions → Waiting on you → Before you talk (prep) → This
  week, program and the existing sections.
- **Deferred:** pattern statistics (one "How we know" line per pattern), raw tables.
- **States:** patterns: not enough history ("Patterns show after about 8 weeks of sessions with sleep or daily
  checks. {first} has n weeks so far."); none found ("Nothing stands out yet"); privacy (team: "What works for Mei
  comes from what Mei shares with Leo, so it stays with them." and the timeline shows training only). Timeline: no
  data ("Nothing synced yet…"); loading skeleton. Pin: toast with Undo.

### Clients → Grid
- **Purpose:** everyone, last 14 days, on one screen: who trains, who's strained, who's gone quiet.
- **Primary action:** tap a row → client page.
- **Shows:** a 14-column cell per day: filled = trained; a tone mark under it (ease = brand, watch = amber); legend
  in words; each row's text alternative ("Jordan: trained 6 of 14 days. 2 days with 2 or more strain signals, latest
  today: short sleep, low HRV").
- **States:** no data for a client ("not connected" row); empty roster → invite.

### Invite → first insight
- **Purpose:** the coach knows what they'll get once the client connects.
- **Shows:** after "Invite ready", "What you'll see next: when {first} connects Apple Health or Health Connect, the
  history their health app shares shows up here: workouts, sleep, HRV, resting heart rate, food, and the cycle if
  they choose to share it." Demo: "See a connected client" → the sample client with the connected banner.
- **Honesty:** never promises a backfill depth. Health Connect may limit how far back an app can read (to verify
  per Android version: `docs/features/sources.md`).

---

# After building

## 4. What shipped

| Area | Where |
|---|---|
| Today (first tab, login lands here) | `apps/coach/app/(tabs)/today.tsx`, `src/today/useToday.ts`, `src/today/actions.tsx`, `src/today/store.ts` |
| Act today rules, messages, lane summaries, day detail, roster text, connected summary | `packages/core/src/coachToday.ts` (24 tests in `test/coachToday.test.ts`) |
| Sample client, light MOCK histories, today's MOCK plans | `packages/core/src/demo/coachToday.ts` |
| Where history comes from (demo vs connected, sample, first-run toggle) | `apps/coach/src/today/data.ts` |
| Client page: What works → timeline → wins → What to do | `app/client/[id]/index.tsx`, `src/client/WhatWorks.tsx`, `src/client/Timeline.tsx`, `src/client/Wins.tsx` |
| Playbook (pin, dismiss, own note) | `src/playbook/store.ts` (device-local MOCK transport; `TODO-INTEGRATE` a `playbook_entries` table) |
| Clients → List / Grid; Needs you narrowed to waiting items; Done | `app/(tabs)/clients.tsx`, `src/clients/RosterGrid.tsx` |
| Thread prefill + closing the loop | `app/client/[id]/thread.tsx` (`?draft=&done=&checkin=`) |
| Invite → what you'll see next; connected state | `app/invite.tsx`, client page `?connected=1` |
| Demo: first-login preview | Me → Demo → First login preview, or `/coach-app/today?firstrun=1` (`=0` to leave) |

Connected builds: Check in, waiting items, programs and messages are live as before. Daily histories, patterns and
wins need a `client_days_for_coach` RPC (shared rows only) and are marked `TODO-INTEGRATE` in `src/today/data.ts`;
until then a connected client shows the honest "Nothing synced yet" states, and Act today uses shared pain and fuel
only. No SQL in this change.

## 5. Screenshots reviewed

390×844, light and dark, demo build (`scripts/build-web.sh` output served statically), zero console errors on every
screen: Today (3 frames), the Offer-the-easier-version sheet, Today after sending (Done today), client page for
Jordan (6 frames: what works, timeline, day detail, wins, what to do), Jordan connected, Aisha (no patterns yet,
pain lane), Mei as the head coach (team privacy: training only), Clients → Needs you and → Grid, Invite ready with
"What you'll see next", Me (demo toggles), first-login Today, the sample client (6 frames) and first-login Clients.
1280 wide, light and dark: Today, first-login Today, Jordan, Clients grid. Scripts and images are in the session
scratchpad (`coachexp/sweep.js`, `wide.js`, `walk.js`, `shots/`).

## 6. Timed first-time-trainer walkthrough

Machine timings on the static demo build (headless Chromium, 390×844), taps counted by script. Reading time is a
judgement, not measured.

| Moment | Target | Result |
|---|---|---|
| First login → first insight on screen ("5.9 h sleep, HRV 13% under usual and resting HR 6 bpm over usual · Lower A today") | 10 s | **0.7 s** to render; about 5 s to read the banner and the first row |
| First login → a pattern ("Lifts tend to run 5% lower after short nights") | — | **1 tap**, 0.5 s |
| Taps to invite from Today | under 1 min | **2 taps** (Invite your first client → type the email → Create invite) |
| Morning: open → first action visible | 30 s | **0.5–1.0 s**; **2 taps** to send the easier version |
| Can they say the sentence after 60 s? | yes | Likely: the banner says "shows what works for them", the sample's page heading is "What works for Sam" with three findings, and Today's first row is a concrete change for today |

## 7. Cognitive walkthrough: Maya, a solo strength coach, first login, then her first Monday

1. **Lands on Today, no clients.** "This is what you'll see for every client." and one orange button. *Does she know
   what Spotter is for?* Yes: the body names the data and "what works for them", and the sample row underneath shows
   it working. *Is it obviously sample data?* Yes: "Sample" tag, "made-up data (MOCK)" in the banner and on the page.
2. **Opens the sample client.** First: "What works for Sam", findings with "Clear in their data" and what was
   compared, and a "Try:" line. The counts ("8 sessions after short nights vs 39") make it feel earned; "Leads to
   talk about, not rules" sets the tone. Pin to playbook / Dismiss are right there.
3. **Timeline.** Every lane lines up by day; short nights and low-HRV days are the only orange marks; today's column
   is shaded; tapping a day reads it out in words. The last two orange bars sit right above today's detail box.
4. **Invite your first client → email → Create invite.** QR, link, and "What you'll see next", with no promised
   backfill depth.
5. **Monday with clients.** Act today (Jordan: offer the easier version; Aisha: shoulder vs Full Body C), Check in
   (Chris, Priya, Mei), Celebrate (Mei's balance goal, Jordan's steadier sleep). The most important thing is the first
   row and the only filled button. She sends the offer in 2 taps; it moves to "Done today" with Undo.
6. **Messages Chris from Check in.** The thread opens with the question ready to edit; sending logs the check-in and
   says so. No separate "Mark handled" step.
7. **Clients → Grid.** Eight rows × 14 days; Chris's run of empty squares with amber dots is visible at a glance.

## 8. Heuristic issues found (and what happened)

| ID | Where | Issue | Severity | Status |
|---|---|---|---|---|
| E1 | Today, Check in | Priya's "Payment failed" appeared in Check in **and** in "Also waiting on you" (repeated facts again) | High | Fixed: payment only under waiting |
| E2 | Today, team | Head coach got "Message Mei" for an assistant's client with the neutral reason: the message would guess at health she can't see | High | Fixed: "Open Mei", the line says "Leo coaches them"; Ask Leo is on the card there |
| E3 | Client page | "From Jordan's own 8 weeks" while the patterns used 16 | High (honesty) | Fixed: weeks from the full history |
| E4 | Timeline, cycle | Phases were opacity-only, follicular and luteal near-identical in dark | High (a11y) | Fixed: letters in segments, legend in words, day detail names the phase |
| E5 | Clients grid | Filter chips visible but not applied; "Message these 5" in grid | Medium | Fixed: hidden in grid; the grid shows everyone (search applies) |
| E6 | Grid | Tomás (nothing shared) drew 14 empty squares, reading as "never trains" | Medium | Fixed: "Nothing shared yet" |
| E7 | Pain lane | Dots overlapped at 8 weeks | Low | Fixed: radius capped to the column |
| E8 | First-login Clients | "Needs you" chip empty | Medium | Fixed: first login shows everyone, no chips, plus Invite |
| E9 | Day detail | "No training" on a day whose session is still to come | Low | Fixed: "No training logged" |
| E10 | What works | Quiet buttons centred | Low | Fixed: left-aligned |

## 9. Self-critique: the 10 worst remaining problems

1. **Connected builds have no history yet.** Timelines, patterns and wins are demo-only until the
   `client_days_for_coach` RPC exists; a real first client shows "Nothing synced yet". (High, needs backend work.)
2. **Playbook is device-local.** Pins and notes don't sync across devices. (Medium)
3. **Pattern rows are tall.** Three findings with a full button each push the timeline below the fold; an icon-button
   pin would be denser. (Medium)
4. **1280 wide is the phone layout stretched.** No max content width in the shared `Screen` (out of scope). (Medium)
5. **Timeline taps are about 6 px columns at 8 weeks.** The ‹ › steppers and the 4-week view are the accessible
   route. (Medium)
6. **The easier-version offer is a message, not a session change.** No one-tap override from Today; "Edit today's
   session myself" is the alternative. (Medium)
7. **Today doesn't escalate waiting items.** A failed payment stays in one quiet line by design. (Low)
8. **Imported workouts stack as outlined bars on Spotter bars;** the order is only explained in the text alternative.
   (Low)
9. **A check-in logged by message has no undo** outside Keeping clients. (Low)
10. **The six light MOCK histories are synthetic and regular-looking** next to Jordan's and Mei's. (Low)

## 10. Scorecard (1–5)

| Area | Score | Why |
|---|---|---|
| Time to first value | 5 | Sample client + banner: an insight on screen in under a second, the sentence in the banner |
| Clarity of the job (Today) | 4 | Three named groups, one line of why, one button; "Also waiting" keeps the inbox out of the way |
| Findability in ~3 s | 4 | First row + the only filled button; the client page leads with "What works" |
| One primary action per screen | 4 | Today: first item (Invite on first login); client: Message; sample: Invite. Pin buttons are secondary but heavy |
| Data drawn, not described | 4 | Aligned-lane timeline and roster grid with words as the text alternative; no charts on Today |
| Feedback and states | 4 | Loading, empty, error, all good, first run, done today with Undo, connected banner |
| Privacy and trust | 4 | Cycle lane only when shared; team head coach sees training only; MOCK labelled everywhere |
| Visual quality (art direction) | 4 | Condensed headings and counts, hairlines, brand only on the primary and strain marks; dark checked |
| **Overall** | **4** | |
