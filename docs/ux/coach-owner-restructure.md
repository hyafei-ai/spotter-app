# Coach owns the business — UX pass (Oct 24, 2026)

App-ux-improvement pass for the restructure that followed the product owner's correction: **there are no gym
owners.** Spotter is two-sided, the client and the coach, and the coach owns their own coaching business (the tenant
"owner" role). Assistant coaches are an optional team feature. A solo coach is the default and the main case.

Walkthroughs and scores below are design judgements written by AI from screenshots of the demo build, not research.

## 1. The coach's job here

From [`docs/jtbd.md`](../jtbd.md):

- **Coaching:** "Help me remember what's going on with each of my clients so I don't drop the ball."
- **Business:** "Help me keep my clients, and my income, by showing me who to check in with before they drift away."

### Critical tasks

| # | Task | Frequency | Cost of failure | Where |
|---|---|---|---|---|
| C1 | See who could use a check-in, and why | Daily / a few times a week | A client drifts off unnoticed | Clients → Needs attention |
| C2 | Prep and do the check-in (what to ask), then record it | Per client, under 30 s to a decision | Repeated nudges, no record, no "kept" proof | Client detail → Check in card |
| C3 | See income at risk and who stayed after a check-in | Weekly | No sense of whether the effort pays | Me → Your business → Keeping clients |
| C4 | Teams only: ask the client's own coach to check in | Occasional | Health detail leaks to the wrong coach; nobody acts | Client detail → Check in card |

## 2. Flows: old vs new

**OLD (gym-owner model)**
- Owner: Me → Your members → **Members to talk to** (its own list, yearly values, "hand to a coach" sheet, kept list)
  → asks a coach → the coach sees a request in Clients → marks it handled → "How did you check in?".
- Owner: Me → **Retention** (MRR at risk, trend, kept total, a link back to Members to talk to).
- Coach: Clients → **Needs attention** (a third list, physiology reasons) → client → Between sessions (no way to log).
- Web: two pages, **Members to talk to** and **Retention**, each with its own list.
- Owner never saw any health reason, even for their own clients.

**NEW (coach owns the business)**
- **C1/C2:** Clients → **Needs attention** → client → **Check in** card (level, reasons, what to ask) → message or call
  → **I checked in** (message / call / session / other, optional note) → "✓ You called on Oct 23. You'll see on
  Keeping clients whether Chris stayed."
- **C3:** Me → **Your business** → **Keeping clients** → income at risk → **See who needs a check-in (4)** → Needs
  attention (C1). The same screen shows the 12-week trend and kept after a check-in, with the list.
- **C4 (teams only):** on the Check in card for an assistant's client: "Leo coaches Mei, so what Mei shares stays
  between them." → **Ask Leo to check in** → it appears in Leo's Clients list.
- Web: one page, **Keeping clients** (`/dashboard/retention`), with the list, trend and kept.

**Removed:** Members to talk to (coach app and web), the Me "Your members" row, the yearly-value sheet, the owner's
neutral line for their own clients, the "hand to a coach" picker for a solo coach.
**Combined:** three lists into one (Needs attention); Retention and Members to talk to into Keeping clients; the Me
"Your business" and "Business" sections into one.
**Moved:** check-in logging → client detail; the kept list → Keeping clients; hand-off → client detail (teams only).

Old links: `/coach-app/members` → `/clients?filter=attention`; `/dashboard/members` → `/dashboard/retention`.

## 3. Screen specs

### Clients → Needs attention (coach app)
- **Purpose:** the one list of who could use a check-in, most urgent first.
- **Primary action:** open a client (row tap).
- **Shows:** name, "Needs a check-in soon" / "Worth watching", top two reasons, plan value "$160/mo" (owner role
  only, right-aligned in grey).
- **Deferred:** all reasons, what to ask, logging (client detail); money totals (Keeping clients).
- **States:** loading (two skeleton rows); empty "Nobody needs a check-in right now. Everyone's training and sharing
  as usual."; error "Couldn't load who needs attention" + Try again; search "No clients match."
- **Entry:** the chip, or `/clients?filter=attention` from Keeping clients and old links.

### Client detail → Check in card
- **Purpose:** prep and record one check-in in under 30 seconds.
- **Primary action:** the screen's footer stays **Message {name}** (that is how most check-ins happen); **I checked
  in** is the card's secondary button so the screen keeps one primary.
- **Shows:** level; engagement reasons; shared signals in bold when worth raising (own coach only); up to three
  "What to ask" lines; last check-in; teams only, who coaches them and **Ask {coach} to check in**.
- **Deferred:** money (Keeping clients); kept outcome (Keeping clients).
- **States:** loading (skeleton for the shared part); not on the list → plain "Between sessions" section; success →
  toast, then for 7 days the card reads "✓ You called on Oct 23 …" with a quiet "Log another check-in"; error →
  toast "Couldn't save that. Try again." with the sheet still open; team request pending → "Asked Leo on Oct 20 · not
  checked in yet".

### Me → Your business (coach app, owner role)
- **Purpose:** where the business lives: Keeping clients, Team, Import and export.
- **Primary action:** none (a menu). Keeping clients is first, with "≈ $632 a month at risk · 4 clients".
- **States:** loading subtitle "Income at risk, the trend, and who stayed after a check-in"; "Nothing at risk this
  week". Solo: Team reads "Just you · add an assistant coach when you grow". Assistants don't see the section.

### Keeping clients (coach app, owner role)
- **Purpose:** how much income is at risk, is it getting better, and did check-ins work.
- **Primary action:** **See who needs a check-in (n)**, right under the headline figure.
- **Shows:** "≈ $632 a month" per currency with the soon / watching split; 12 weekly bars with a text summary; kept
  this year "≈ $480 a month · 3 clients (≈ $5,760 a year)", the caveat and each check-in with Kept / Pending / Asked /
  Left; how it's worked out (the team sentence only when there's a team).
- **Deferred:** the list itself (Needs attention), reasons (client detail).
- **States:** loading skeleton; error "Couldn't load your numbers" + Try again; nothing at risk; no kept yet; an
  assistant who opens the URL gets "Only the head coach sees the business numbers." + See who needs a check-in.

### Web → Keeping clients (`/dashboard/retention`)
- **Purpose:** the same business view on desktop, with the list inline.
- **Primary action:** **See who needs a check-in (n)** (jumps to the list on the page).
- **Shows:** headline, list (level, reasons, plan value; teams only "Coached by Leo" + Ask Leo), trend with a table
  alternative, kept with the list, the points table.
- **States:** "Working out this week…"; error + Try again; "Nobody needs a check-in right now"; status line after
  asking a coach. Phone width: no horizontal page scroll at 390 px; tables scroll in their own container.

## 4. Screenshots reviewed

390×844, light and dark, demo build (`dist/` + `next start`), no console errors on any screen:
Clients → Needs attention; client detail for Jordan (not on the list), Chris (solo-style: own client), Mei (team:
Leo's client, as head coach and as Leo); the check-in sheet and the saved state; Me (head coach and assistant);
Keeping clients (head coach, and the assistant's refusal); `/coach-app/members` (lands on Needs attention). Web
`/dashboard/retention` and `/dashboard/members` (redirects) at 1280 and 390, light and dark.

## 5. Cognitive walkthrough: a first-time solo coach

Maya has 8 clients, no team. It's Monday.

1. **Opens Clients.** Sees "Needs you" selected and a chip row. *Will she know Needs attention is the check-in list?*
   Partly: "Needs you" and "Needs attention" read alike (issue H1). The caption under the chip explains it once
   selected.
2. **Taps Needs attention.** Four rows, each with "Needs a check-in soon" in the accent colour and two plain reasons.
   *Does she know what to do?* Yes: rows have chevrons, and the caption ends "Open someone to log your check-in." The
   plan value tells her what's at stake without a dashboard.
3. **Opens Chris.** Before you talk, Needs you (triage), then the **Check in** card. *Can she find the reasons in 3 s?*
   Yes: the card's headline is the level, in the accent colour, with a left rule. The "Needs you" block above repeats
   the same facts in triage words (issue M1).
4. **Calls Chris, taps I checked in, picks Call, saves.** Toast, and the card turns to "✓ You called on Oct 23.
   You'll see on Keeping clients whether Chris stayed." *Is the result visible and is the next step clear?* Yes.
5. **Me → Your business → Keeping clients.** "≈ $632 a month" and one orange button. Chris is listed as Pending,
   "you'll know on Dec 22". *Does she understand "kept"?* The caveat is right under the figure.
6. **No team UI anywhere** for a solo coach: no "Ask a coach", no neutral line, Team says "Just you".

## 6. Heuristic issues found (and what happened)

| ID | Where | Issue | Severity | Status |
|---|---|---|---|---|
| X1 | Client detail | "I checked in" was a second filled primary next to the footer's Message button | High | Fixed: secondary (quiet once done or in a team) |
| X2 | Client detail | After saving, the card still shouted "Needs a check-in soon" with the same big button: no visible success | High | Fixed: success line, accent removed, "Log another check-in" for 7 days |
| X3 | Me | Two sections, "Your business" and "Business", one after the other | High | Fixed: one "Your business" section with Keeping clients first |
| X4 | Client detail (team) | The head coach still saw Read, Pain, Cycle and Fuel sections for an assistant's client | Critical (privacy) | Fixed: `healthOnly` gate with `viewerSeesHealth` |
| X5 | Web, 390 px | Plan value and "Ask Leo" wrapped into a detached block; table header broke "POIN TS" | Medium | Fixed: value pinned right, button under the reasons, header no-wrap |
| X6 | Check-in card | "Chris hasn't shared anything beyond sessions…" padded the card for engagement-only clients | Medium | Fixed: hidden inside the card |
| X7 | Keeping clients | Neutral-line explanation shown to solo coaches | Medium | Fixed: only with a team |

## 7. Self-critique: the 10 worst remaining problems

1. **H1 "Needs you" vs "Needs attention"** are near-synonyms on adjacent chips. A clearer name ("Check-ins") would help;
   kept because the product owner named the filter. (High, needs a product decision.)
2. **M1 Needs you and Check in overlap** on client detail ("Missed 2 sessions" vs "Sessions fell from 83% to 17%"):
   two engines, two vocabularies. (Medium)
3. **Mark handled vs I checked in**: two ways to close the loop; only one records a check-in (except team requests).
   (Medium)
4. **The solo case wasn't screenshotted**: the demo tenant has an assistant (Leo). Solo behaviour is covered by core
   tests (`solo`, `checkInCoach`), not by a screenshot. (Medium)
5. **Keeping clients' split line is dense** ("4 clients · needs a check-in soon ≈ $312 (2) · worth watching ≈ $320
   (2)"); a two-row breakdown would scan faster. (Medium)
6. **The check-in card is below the fold** on clients with a long "Needs you" block. (Medium)
7. **Memory and prep** may still show a body-variance line to a team's head coach for an assistant's client. (Medium,
   teams only)
8. **Web can't log a check-in**; it only points to the coach app. (Low)
9. **Web "See who needs a check-in"** jumps to a list that's already just below. (Low)
10. **Live business totals leave out shared-signal-only clients** (engagement-only SQL by design), so the demo and a
    connected build can disagree. (Low, documented gap)

## 8. Scorecard (1–5)

| Area | Score | Why |
|---|---|---|
| Clarity of the job (one list, one place to log) | 4 | Three lists became one; chip naming still close to "Needs you" |
| Findability in ~3 s | 4 | Level headline and accent rule on the card; figure + one button on Keeping clients |
| One primary action per screen | 4 | Footer Message stays primary; Keeping clients has one button |
| Feedback and states | 4 | Loading, empty, error, success all specified and visible; success persists a week |
| Privacy and trust | 4 | Solo: everything their clients share; team: neutral line and section gating; memory/prep gap remains |
| Visual quality (art direction) | 4 | Hairlines, warm neutrals, brand only on the primary button and the urgent rule; works in dark |
| Phone-width web | 4 | No horizontal scroll at 390; tables scroll in place |
| **Overall** | **4** | |

## Decision after review (Oct 24)
Issue 1 resolved: the "Needs attention" filter is renamed **Check in**. "Needs you" stays for things waiting on the
coach (messages, form checks, payments, follow-ups); "Check in" is who could use a conversation. The same three words
(Act today / Check in / Celebrate) will group the coach's Today home (`docs/ux/first-value.md`). Issues 2 and 3
(repeated facts; two ways to close the loop) are folded into that home rebuild.
