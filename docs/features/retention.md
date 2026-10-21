# Members to talk to, and who stayed

Job: the **owner** job in [`docs/jtbd.md`](../jtbd.md#owner): "Save me preventable member churn by showing my
coaches who to intervene with, before it's too late."

Each piece below passes one of that job's two acceptance tests:

| Piece | Test it passes |
|---|---|
| **Members to talk to** (owner only), with plain reasons and the yearly value at stake | (1) predicts a specific cancellation |
| **Hand to a coach**: it shows up in that coach's Clients list as a check-in | (1) prevents it through the coach |
| **Kept after a check-in**: still active 60 days later, with the dollar value | (2) shows a member was kept, with a dollar amount |

The rules are in `packages/core/src/signals.ts`: `memberRisk`, `yearlyValueCents` and `interventionOutcome`. The
thresholds stay as they are there. `packages/core/src/retention.ts` gathers raw activity into those signals and
doesn't repeat them.

## What's built

### Members to talk to
- **Where:** coach app → Me → *Your members* → **Members to talk to** (`apps/coach/app/members.tsx`), and the web
  dashboard → **Members to talk to** (`/dashboard/members`).
- **Owner only.** In the coach app, the row and the screen are hidden from assistants (`useRole`). In the
  database, `members_at_risk()` refuses anyone who isn't the owner.
- **Who's listed:** high and medium members, sorted by level, then by yearly value.
  - Each row shows the reasons in plain words ("No session in 9 days", "Payment failed"), their plan, and
    "≈ $1,920 a year".
  - The assumption is written out next to the figure: "their plan works out to $160 a month × 12".
  - Session packs are pay as you go, so they don't get a yearly figure.
- **Signals**, per member:
  - sessions planned vs done in each of the last 4 weeks (from the active assignment's program days and finished
    sessions)
  - last session
  - last app open (`memberships.last_app_open_at`)
  - weekly check-ins missed in the last 28 days (only when a check-in template exists)
  - payment status (`past_due` or `unpaid`)
  - easy-day reads in the last two weeks vs the two before
- **Who's left out:** paused and cancelled members. Anyone with less than two weeks of history is counted as
  "not enough data yet" instead.
- **States:**
  - loading
  - "Nobody needs a nudge this week."
  - "Not enough data yet…"
  - an error with Try again
  - offline, which shows the last list with its time, and turns off hand-offs in connected builds

### Hand to a coach
- From a member's sheet, the owner picks a coach. It defaults to the member's assigned coach, but any coach (or
  "Me") works. A note is optional.
- `hand_to_coach()` creates an `interventions` row and a `check_in_request` triage item addressed to that coach,
  worded "{Owner} asked you to check in: {top reason}". The sheet shows the owner exactly what the coach will see.
- **Wording.** Coach-facing text never says "churn" or "at risk". The RPC refuses a reason that does, and the SQL
  test checks it.
- **Visibility.** The addressed coach sees the request in Clients, even for a member they don't normally coach.
  Other coaches don't, and neither does the owner; the owner sees it as "Asked Leo on Oct 20" on the members
  screen.
- **Asking again** moves the open request to the new coach.
- **Marking it handled** (swipe, the actions sheet, or the client screen) first asks "How did you check in?":
  message, call, at a session, or other, plus an optional note. `complete_check_in()` records the date and the
  action and clears the item.

### Kept after a check-in
- Every check-in starts as **Pending**. It becomes **Kept** once the member is still active 60 days later
  (`interventionOutcome`, `KEPT_AFTER_DAYS`), or **Left** if they cancel. Requests the coach hasn't acted on yet
  show as **Asked**.
- The summary reads "Kept this year: 3 members · ≈ $5,760 a year", followed by a list with dates. The value is
  the sum of monthly plan × 12.
- This caveat always appears with it, word for word: "Members still with you 60 days after a coach checked in.
  This shows they stayed, not that the check-in alone kept them."
- **Optional comparison:** "Spotter costs ≈ $X a year". It shows only when `SPOTTER_PRICE_MONTHLY_CENTS` is set.
  Pricing is still an open question, so it's `null` and the line is hidden.

## Database (`20261022030001_retention.sql`)
- **`member_risk_snapshots`:** one row per member per night. The owner can read it; coaches and clients can't.
  `retention-nightly` writes it with the service role, using the same core code (copied to
  `functions/_shared/core` by `sync-schemas.mjs`).
- **`interventions`:** readable by the owner and the addressed coach. Clients can never read it. Writes go
  through the RPCs only.
- **`triage_items`** gains `coach_id` and the `check_in_request` reason. `triage_coach` is recreated: unaddressed
  items behave as before, and addressed ones are visible to their coach and the owner.
- **RPCs:**
  - `member_risk_inputs(t, today)`: owner or service role.
  - `members_at_risk(t)` and `kept_summary(t, yr)`: owner only. `kept_summary` also returns the 60-day
    outcome.
  - `hand_to_coach(...)`: owner only.
  - `complete_check_in(...)`: the addressed coach or the owner.
- **Easy-day reads:** read by `ease_reads()`, an adapter guarded with `to_regclass('public.daily_checks')` and a
  column check. It returns 0 until the athlete daily check table exists.
- **Tests:** `tests/82_retention.test.sql`.
  - Assistants and clients can't call the RPCs or read the tables.
  - A hand-off creates a coach item with no churn wording.
  - The check-in records the date and the action.
  - Day 59 is pending, day 60 is kept, and a cancellation is left, with its date.
- Core tests: `packages/core/test/retention.test.ts`.

## Mock data
`packages/core/src/demo/retention.ts` (labelled MOCK) holds sample member activity and five earlier check-ins.
They run through `membersToTalkTo` and `keptSummary`, so the demo shows:
- Chris: high.
- Priya and Mei: medium.
- 3 kept (≈ $5,760 a year), 1 left, and 1 pending.

Check-ins asked in the demo are stored in `localStorage` under `spotter.retention.<slug>`.

## For the integrator
- **Daily checks:** `ease_reads()` assumes `daily_checks(tenant_id, client_id, date, read_tone)` with
  `read_tone = 'ease'`. If the athlete daily-check branch stores the read differently, update it, and fill
  `easeReads*` in `demo/retention.ts` from its demo checks.
- **Triage reasons:** the reason-code constraint lists the original 8 reasons plus `check_in_request`. If another
  branch also adds reasons, merge the two lists.
- **Copied core code:** `sync-schemas.mjs` now also copies `signals.ts`, `grow.ts` and `retention.ts` into
  `_shared/core`.

## Gaps
- The web page is demo-only, like the Team page. In connected builds, the coach app calls the RPCs.
- The nightly cron schedule is a comment in the migration (pg_cron + pg_net), the same as `ai-triage`.
