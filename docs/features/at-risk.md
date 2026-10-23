# Check in and Keeping clients

Part of the physiology layer ([`docs/physiology.md`](../physiology.md)). Spotter has two roles, the client and the
coach, and the coach owns their coaching business. Jobs from [`docs/jtbd.md`](../jtbd.md):

| Piece | Who | Job | Test it passes |
|---|---|---|---|
| **Check in** in Clients: the one "who to check in with" list, with reasons from engagement and what each client shared | Coach | Coaching: remember; business: keep clients | remembers what they'd otherwise miss; spots a specific client who might leave |
| **Check in** card on client detail (Between sessions), with what to ask and **I checked in** | Coach | Same | preps a real conversation in under 30 seconds and records it |
| **Keeping clients** (Me → Your business): live MRR at risk, 12-week trend, MRR kept after a check-in | The coach who owns the business (owner role) | Business: keep clients and income | money at stake; clients kept, with a dollar amount |

Lists never say churn or risk ("Needs a check-in soon", "Worth watching"). Health detail stays with the client's own
coach. Logging check-ins and the kept list are in [`retention.md`](retention.md).

## How risk is worked out

`packages/core/src/atrisk.ts` → `athleteDropoutRisk(activity, physio, today)`. It's `memberRisk` (signals.ts,
unchanged) plus transparent physiology points. Same thresholds: **5+ high, 3–4 medium**.

| Signal | Points | Their coach reads | Teams: head coach, for an assistant's client |
|---|---|---|---|
| Sessions fell to half of plan or less (last 2 weeks vs the 2 before) | 3 | "Sessions fell from 83% to 17% of plan" | same |
| No session in 10+ days | 2 | "No session in 12 days" | same |
| No app open in 7+ days | 2 | "Hasn't opened the app in 8 days" | same |
| Payment failed | 2 | "Payment failed" | same |
| Missed 2+ weekly check-ins | 1 | "Missed 2 weekly check-ins" | same |
| First two months (only with another signal, once) | 1 | "In their first two months" | same |
| Running tired: easier-day reads on 4+ of the last 7 days (shared) | 2 | "Running tired 5 of the last 7 days" | "Their coach has flagged something worth a check-in" |
| Fuel check says talk to someone (shared) | 2 | "Fuel check flagged" | same neutral line |
| Fuel check says watch (shared) | 1 | "Fuel check: one to watch" | same neutral line |
| Ongoing pain: 3+ days in 14 or a level of 6+ (shared) | 2 | "Left knee pain for 4 days" | same neutral line |
| No new best in 8 weeks of steady training (shared) | 1 | "No new best in 9 weeks" | same neutral line |

A solo coach is the client's own coach for every client: they always read the middle column.

- **Easy-day reads moved sides.** `memberRisk`'s "Rough recovery" (+1) comes from daily checks. Here it's
  called with easy-day reads at zero, and tiredness counts only as the shared "Running tired". So it needs
  the client's consent, and only their coach reads it.
- **Reasons** come strongest first. `PHYSIOLOGY_POINTS` and `RISK_POINTS_TABLE` hold the numbers, so the
  explanation on Keeping clients can't drift from the rule.
- **Specific wording** ("Left knee pain for 4 days") needs `PhysiologyDetail` (tiredDays, pain region/side/days,
  weeksSinceBest), passed alongside `PhysiologySignals`. Without it the reason is general ("Ongoing pain logged").
- **Who sees health detail (teams only).** `viewerSeesHealth(viewerId, client, { solo })` is true for the
  client's own coach, for a client with no assigned coach, and always when the business has no other active coach.
  `reasonsFor(viewerId, client, risk)` returns the full risk or `ownerView(risk)`, which keeps the level, points and
  engagement reasons and collapses every physiology reason into one line, `OWNER_NEUTRAL_REASON`: "Their coach has
  flagged something worth a check-in". `checkInCoach(viewerId, client, coaches)` names the other active coach to
  ask, or null, so a solo coach never sees hand-off UI.
- **Rosters:** `atRiskRoster` (Check in; `AtRiskList` applies `reasonsFor`) and
  `ownerRoster(…, { viewerId, solo })` (the web business view: full reasons for the coach's own clients). Both leave
  out paused and cancelled clients and anyone under two weeks in. Check in sorts by level, then points, then
  name; the business view by level, then monthly value. Without `viewerId`, `ownerRoster` returns the neutral copy
  for everyone.
- **Coach copy for levels** (`COACH_LEVEL_TEXT`): high "Needs a check-in soon", medium "Worth watching".

### Money
- `mrrAtRisk(clients)`: one row per currency with high, medium, total and counts. Amounts are **never added
  across currencies**.
- `mrrAtRiskTrend(snapshots, today, { current })`: exactly 12 weeks (Monday starts, `riskWeekStart`) per
  currency. Missing weeks are `null`, never zero. This week comes from the live figure, so the last bar
  matches the headline.
- `mrrKept(interventions, status, today, { year })`: monthly value of clients still active 60 days after a
  check-in (`interventionOutcome`), per currency, each client once. Shown with `KEPT_CAVEAT`.
- `monthlyValueText(cents, currency)`: "$160/mo" for a list row, shown only to the owner role.

Tests: `packages/core/test/atrisk.test.ts` covers points, thresholds, wording, `ownerView` stripping,
`viewerSeesHealth` / `reasonsFor` / `checkInCoach` (solo, own client, assistant's client, invited coach), rosters,
currencies, trend gaps and kept.

## Privacy boundary

| | The client's own coach | Teams: the head coach, for an assistant's client | Assistant coach |
|---|---|---|---|
| Engagement (sessions, app opens, check-ins, payment) | yes | yes | yes, for their clients |
| Physiology (reads, fuel, pain, progress, cycle) | only what the client shared | never; one neutral line instead | only what their own clients shared |
| Money (plan value, MRR at risk, kept) | yes, when they own the business | yes | no |

- **SQL, business side.** `20261023040001_atrisk.sql` never reads `daily_checks`, `ease_reads`, cycle, fuel or
  pain. A SQL test checks the function bodies for those names.
- **Coach side.** Physiology comes from the shared projections only (`spotter.reads`, and the fuel, pain,
  cycle and progress keys below). Connected builds need the equivalent "shared only" RPCs.
- **Client detail.** The Read, Pain, Cycle and Fuel sections render only when `viewerSeesHealth` is true
  (`healthOnly` in `src/ClientSections.tsx`).

## What's built

### Coach app
- **Clients → "Check in"** chip (`src/atrisk/AtRiskList.tsx`). `/clients?filter=attention` opens it
  directly (Keeping clients and the old `/members` link use this).
  - Ordered by level, then points. Reasons through `reasonsFor` for the viewer.
  - Each row: name, the level in words, the top two reasons, and (owner role only) the plan value, "$160/mo",
    from the owner-only retention inputs. Tap opens the client.
  - States: loading, error with Try again, "Nobody needs a check-in right now", search.
- **Client detail → Between sessions / Check in** (`BetweenSessionsSection`, rendered right after Needs you).
  - Not on the list: running-tired days this week, the fuel check, pain, last best or weeks since, and cycle
    phase, each only if shared, plus what to ask.
  - On the list: the Check in card with the level, engagement reasons, the shared signals, what to ask,
    **I checked in**, and (teams only) **Ask {coach} to check in**. See [`retention.md`](retention.md).
  - Copy in `src/atrisk/summary.ts`. Fuel points to a doctor or sports dietitian; it never diagnoses.
- **Me → Your business → Keeping clients** (owner role only, first row of the business section in
  `PlatformRows`). The row's subtitle is MRR at risk and the client count. `app/retention.tsx`: the per-currency
  headline with the "needs a check-in soon" / "worth watching" split, **See who needs a check-in (n)** (the one
  primary action; opens Check in), 12 weekly bars (with a text alternative), MRR kept this year with the kept
  list, and how it's worked out (the neutral-line sentence appears only when there's a team).

### Web dashboard
- **`/dashboard/retention`, "Keeping clients"** (one entry in `src/nav.ts`; `/dashboard/members` redirects here):
  - MRR at risk per currency, with the split and client count, and a "See who needs a check-in" jump link.
  - Who could use a check-in: level, reasons, plan value; teams only, "Coached by Leo" and **Ask Leo to check in**.
  - A 12-week SVG bar chart with `<title>`/`<desc>`, a text summary and a "Show as a table" table.
  - Kept after a check-in this year, with the caveat and the list.
  - The points table.
- **"Live".** The demo recomputes from current demo data on every load. With a Supabase session and
  `NEXT_PUBLIC_TENANT_ID`, `src/retention.ts` reads `mrr_at_risk`, the snapshots, `members_at_risk` and
  `kept_summary` instead, using the signed-in coach's id for `reasonsFor`.
- **Phone width.** At ≤ 640px the dashboard nav becomes a sticky, horizontally scrolling top bar, and content
  has 16px gutters. No horizontal page scroll at 390px; wide tables scroll inside `.table-scroll`.

### Database (`20261023040001_atrisk.sql`)
- **`engagement_inputs(t, today)`:** internal, service role only. It's `member_risk_inputs` without easy-day reads.
- **`engagement_points(...)`:** the `memberRisk` points in SQL, with easy-day reads at zero.
- **`monthly_value_cents(...)`:** `monthlyRevenueCents` in SQL.
- **`mrr_at_risk_for(t, today)`:** internal, service role only. Per currency high/medium/total cents and
  counts, with the same filters as the app (live clients, two weeks of history).
- **`mrr_at_risk(tenant)`:** `security definer`, owner role only (`is_owner`: the coach who owns the business).
  Anyone else gets `42501`.
- **`mrr_at_risk_snapshots (tenant_id, week_start, currency, high_cents, medium_cents, members)`:**
  - RLS lets the owner role read.
  - No write policies, so nobody signed in can write.
- **`snapshot_mrr_at_risk(on_day)`:** service role only. Upserts this week's row per tenant and currency.
  **Not scheduled.** Suggested pg_cron line:
  `select cron.schedule('mrr-at-risk-weekly', '17 4 * * 1', $$ select public.snapshot_mrr_at_risk(current_date) $$);`
- **`client_engagement_inputs(t)`:** for coaches. Engagement only, for the clients `can_see_client` allows,
  with no prices. It feeds Check in in connected builds.
- `20261024010001_coach_check_in.sql` adds function comments naming who each is for; no schema change.
- **Tests:** `tests/86_atrisk.test.sql` (per-currency figures, the two-week rule, role refusals, tenant isolation,
  no health tables in function bodies, snapshot RLS, coach inputs scoped to their clients) and
  `tests/87_coach_check_in.test.sql`.

## Mock data (labelled MOCK)
`packages/core/src/demo/atrisk.ts`:
- **`demoPhysiology()`:** what the sample clients share with their coach.
  - Jordan: fuel, one to watch.
  - Aisha: left shoulder pain, and no best in 9 weeks.
  - Mei: running tired 5 of 7, and the fuel check flagged.
  - Fatima: progress stalled.
  - Priya, Tomás, Chris and Daniel share nothing.
- **`demoMrrSnapshots()`:** 12 weekly USD snapshots ending this week, relative to `Date.now()`.

On the demo today this gives Mei and Chris high, and Aisha and Priya medium. Maya coaches Aisha and reads her
reasons in full. Mei is coached by Leo (the demo assistant), so Maya reads Mei's shared signals only as "Their coach
has flagged something worth a check-in"; Leo reads them in full.

## Demo transport and integration (TODO-INTEGRATE)
`apps/coach/src/atrisk/inputs.ts` reads these `readShared` keys defensively. When a key is missing it falls
back to `demoPhysiology()` for the sample clients:

| Key | Written by | Accepted shapes |
|---|---|---|
| `spotter.reads.<tenant>` | daily check (exists) | `SharedReadsDoc`; easier-day = `read.tone === 'ease'` |
| `spotter.fuel.<tenant>` | fuel build | `{ [clientId] \| byClient \| clients \| shared: { level \| fuelLevel \| pattern.level } }` |
| `spotter.pain.<tenant>` | injury build | per client `PainLog[]` or `{ logs \| entries: PainLog[] }` |
| `spotter.cycle.<tenant>` | cycle build | per client `{ phase \| estimate.phase }` |
| `spotter.progress.<tenant>` | progress build | per client `{ stalled \| progressStalled, weeksSinceBest, lastBest: { date, text \| label } }` |

- **Opting out.** An entry with `shared: false` or `shareWithCoach: false` is treated as not shared.
- **Client ids.** Keys are coach-side client ids, as `spotter.reads` uses (`coachClientIdFor`).

## Contract notes
- `PhysiologySignals` (physiology.ts) is unchanged. The optional detail lives in `PhysiologyDetail` in
  atrisk.ts, and `PhysiologyInput = PhysiologySignals & PhysiologyDetail`.

## Gaps
- **Shared signals never reach the live business figure.** `mrr_at_risk` is engagement only by design (no
  health tables), so live MRR at risk leaves out clients whose only signals are physiology. The demo includes
  them. Closing this needs a coach-set "worth a check-in" flag table that holds no health detail, which
  `mrr_at_risk_for` could then count.
- **Members to talk to is retired** ([`retention.md`](retention.md)), so `memberRisk`'s "Rough recovery" no longer
  shows anywhere in the apps; `membersToTalkTo` stays in core for its tests and the nightly snapshot.
- **Physiology adapters are guesses** at the other builds' demo shapes. Connected builds need shared-only
  RPCs for fuel, pain, cycle and progress.
- **Memory and prep** (Remember section, 30-second prep) still draw on shared reads for any coach who can see the
  client; in a team, the head coach may see a body-variance line there for an assistant's client.
- **The web dashboard has no sign-in.** The live path runs only when a Supabase session and
  `NEXT_PUBLIC_TENANT_ID` exist.
- **The weekly snapshot job isn't scheduled.**
- **Small rule differences:** clients without a subscription count under the tenant's first plan currency
  (or `usd`) with no value. Tenure is counted in calendar days in the app and from noon UTC in SQL, so a
  client can differ by a day around the two-week line.
