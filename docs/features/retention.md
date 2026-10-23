# Check-ins, and who stayed

Job: the coach's **business** job in [`docs/jtbd.md`](../jtbd.md#business-keep-clients-and-income): "Help me keep my
clients, and my income, by showing me who to check in with before they drift away."

Spotter has two roles: the client and the coach, and the coach owns their coaching business (the tenant "owner"
role). This doc covers logging a check-in and seeing who stayed. Who to check in with, and the money at risk, is in
[`at-risk.md`](at-risk.md). The two make one story:

1. **Clients → Needs attention** lists who could use a check-in, with reasons.
2. Open a client → the **Check in** card shows the reasons and what to ask → **I checked in** (message, call,
   session, other).
3. **Me → Your business → Keeping clients** shows who stayed 60 days later, with the money.

| Piece | Test it passes |
|---|---|
| **I checked in** on client detail, with how | (1) acts on a specific client who might leave |
| **Kept after a check-in**: still active 60 days later, with the dollar value | (2) shows a client stayed, with a dollar amount |
| Teams only: **Ask {assistant} to check in**; it shows up in that coach's Clients list | (1) acts through the client's own coach |

The rules are in `packages/core/src/signals.ts`: `memberRisk`, `yearlyValueCents` and `interventionOutcome`. The
thresholds stay as they are there. `packages/core/src/retention.ts` gathers raw activity into those signals and
doesn't repeat them. (Type and SQL names keep "member": they mirror `memberships`.)

## What changed (Oct 2026)

The first build assumed a separate gym owner and had three overlapping lists (Members to talk to, Retention's
list, Needs attention) plus an owner-versus-coach privacy wall. There are no gym owners, so:

- **Members to talk to is retired.** `apps/coach/app/members.tsx` redirects to `/clients?filter=attention`, and its
  Me row is gone. On the web, `/dashboard/members` redirects to `/dashboard/retention`.
- **Logging moved to client detail** (`BetweenSessionsSection`, the Check in card).
- **The kept list moved to Keeping clients** (`apps/coach/app/retention.tsx`), with the headline figure.
- **Hand to a coach** is now team-only, from client detail: "Ask Leo to check in" appears only when the client is
  coached by another active coach.

## What's built

### I checked in (client detail)
- **Where:** client detail, the **Check in** card, shown when the client is on Needs attention. It holds the level
  ("Needs a check-in soon" / "Worth watching"), the engagement reasons, the shared signals (bold when worth raising),
  up to three **What to ask** lines (`src/atrisk/summary.ts`: `whatToAsk`, `whatToAskAboutTraining`), and
  **I checked in**.
- **The sheet** asks "How did you check in?": message, call, session or other (`INTERVENTION_ACTIONS`), plus an
  optional note. `useRetention().logCheckIn` records a done check-in by the viewer (`useLogCheckIn`,
  `src/retention/CheckInDone.tsx`). If a request was open for that client, it completes that one instead.
- **After saving:** a toast, then the card steps back for a week: "✓ You called on Oct 23. You'll see on Keeping
  clients whether Chris stayed." with a quiet **Log another check-in**.
- **Connected builds** call `log_check_in(t, client, reason, how, how_note)`.

### Kept after a check-in (Keeping clients)
- Every check-in starts as **Pending**. It becomes **Kept** once the client is still active 60 days later
  (`interventionOutcome`, `KEPT_AFTER_DAYS`), or **Left** if they cancel. Team requests not acted on yet show as
  **Asked**.
- The headline reads "≈ $480 a month · 3 clients (≈ $5,760 a year)" (`mrrKept`), then a list with dates: "You
  called on May 25 · still with you", "Leo messaged on Aug 20 · still with you".
- This caveat always appears with it, word for word: "Clients still with you 60 days after a check-in. This shows
  they stayed, not that the check-in alone kept them." (`KEPT_CAVEAT`)
- **Optional comparison:** "Spotter costs ≈ $X a year". It shows only when `SPOTTER_PRICE_MONTHLY_CENTS` is set.
  Pricing is still open, so it's `null` and the line is hidden.

### Teams only: ask another coach
- On client detail, when the viewer is the head coach and the client's coach is another active coach
  (`checkInCoach` in core), the card offers **Ask Leo to check in**. A solo coach never sees it.
- `hand_to_coach()` creates an `interventions` row and a `check_in_request` triage item addressed to that coach,
  worded "{Head coach first name} asked you to check in: {top engagement reason}". The sheet shows exactly what the
  coach will see.
- **Wording.** Coach-facing text never says "churn" or "at risk". The RPCs refuse a reason that does, and the SQL
  tests check it.
- **Visibility.** The addressed coach sees the request in Clients, even for a client they don't normally coach.
  The head coach sees "Asked Leo on Oct 20 · not checked in yet" on the card.
- **Marking it handled** in Clients (swipe, actions sheet, or client detail's Needs you) first asks "How did you
  check in?" (`useCheckInDone`). "I checked in" on the card completes it too.

## Database
- `20261022030001_retention.sql` (unchanged): `member_risk_snapshots`, `interventions`, `triage_items.coach_id`
  and the `check_in_request` reason, `member_risk_inputs`, `members_at_risk`, `hand_to_coach`, `complete_check_in`,
  `kept_summary`.
- `20261024010001_coach_check_in.sql`:
  - **`log_check_in(t, client, reason, how, how_note)`**: the business's coach (owner role) or the assistant
    assigned to the client. Completes an open request (addressed coach or owner only) or records a new, done check-in
    with `coach_id = requested_by = auth.uid()`.
  - **`hand_to_coach`** recreated with client and head-coach wording; same behaviour.
  - Function comments say who each is for ("the coach who owns the business"; "teams only").
- **RPC access:** `members_at_risk`, `kept_summary` and `mrr_at_risk` stay owner-role only (owner = the coach who
  owns the business), so assistants never see money.
- **Tests:** `tests/82_retention.test.sql` (unchanged) and `tests/87_coach_check_in.test.sql`: the coach logs a
  check-in on their own client and it shows as pending; risk wording and unknown actions are refused; an assistant
  logs on their own client but not on another's; a client can't; logging completes an open team request.
- Core tests: `packages/core/test/retention.test.ts`, `packages/core/test/atrisk.test.ts`.

## Mock data
`packages/core/src/demo/retention.ts` (labelled MOCK) holds sample client activity and five earlier check-ins. Maya
owns the business; Leo Park is an optional assistant, so the demo also shows the team case. They run through
`keptSummary` and `mrrKept`, so the demo shows 3 kept (≈ $5,760 a year), 1 left and 1 pending. Check-ins logged in
the demo are stored in `localStorage` under `spotter.retention.<slug>`.

## For the integrator
- **Daily checks:** `ease_reads()` assumes `daily_checks(tenant_id, client_id, date, read_tone)`. The roster no
  longer uses it (shared reads come through `atrisk.ts`), but `members_at_risk` still returns it.
- **Copied core code:** `sync-schemas.mjs` copies `signals.ts`, `grow.ts` and `retention.ts` into `_shared/core`.

## Gaps
- The web page is demo-only, like the Team page. In connected builds, the coach app calls the RPCs.
- Logging a check-in on the web isn't built; the web page points to the client's page in the coach app.
- The nightly cron schedule is a comment in the migration (pg_cron + pg_net), the same as `ai-triage`.
