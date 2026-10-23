# Needs attention (coach) and MRR at risk (owner)

Part of the physiology layer ([`docs/physiology.md`](../physiology.md)). Two jobs from [`docs/jtbd.md`](../jtbd.md):

| Piece | Who | Job | Test it passes |
|---|---|---|---|
| **Needs attention** in Clients, with reasons from what each athlete shared | Coach | Remember what's going on with each athlete | (1) remembers what they'd otherwise miss between sessions |
| **Between sessions** on client detail, with what to ask | Coach | Same | (2) preps a real conversation in under 30 seconds |
| **Retention**: live MRR at risk, 12-week trend, MRR kept after a check-in | Owner | Save preventable member churn | (1) predicts specific cancellations, with money; (2) shows members kept, with a dollar amount |

Coaches never see churn or risk wording. Owners never see health data.

## How risk is worked out

`packages/core/src/atrisk.ts` → `athleteDropoutRisk(activity, physio, today)`. It's `memberRisk` (signals.ts,
unchanged) plus transparent physiology points. Same thresholds: **5+ high, 3–4 medium**.

| Signal | Points | Coach reads | Owner reads |
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

- **Easy-day reads moved sides.** `memberRisk`'s "Rough recovery" (+1) comes from daily checks. Here it's
  called with easy-day reads at zero, and tiredness counts only as the shared "Running tired". So it needs
  the athlete's consent, and it never reaches the owner.
- **Reasons** come strongest first. `PHYSIOLOGY_POINTS` and `RISK_POINTS_TABLE` hold the numbers, so the
  owner's explanation table can't drift from the rule.
- **Specific wording** ("Left knee pain for 4 days") needs `PhysiologyDetail` (tiredDays, pain region/side/days,
  weeksSinceBest), passed alongside `PhysiologySignals`. Without it the reason is general ("Ongoing pain logged").
- **`ownerView(risk)`** keeps the level, points and engagement reasons. Every physiology reason collapses into
  one line, `OWNER_NEUTRAL_REASON`: "Their coach has flagged something worth a check-in".
- **Rosters:** `atRiskRoster` (coach) and `ownerRoster` (owner, through `ownerView`). Both leave out paused and
  cancelled members and anyone under two weeks in. The coach list sorts by level, then points, then name.
  The owner list sorts by level, then monthly value.
- **Coach copy for levels** (`COACH_LEVEL_TEXT`): high "Needs a check-in soon", medium "Worth watching".

### Money
- `mrrAtRisk(members)`: one row per currency with high, medium, total and counts. Amounts are **never added
  across currencies**.
- `mrrAtRiskTrend(snapshots, today, { current })`: exactly 12 weeks (Monday starts, `riskWeekStart`) per
  currency. Missing weeks are `null`, never zero. This week comes from the live figure, so the last bar
  matches the headline.
- `mrrKept(interventions, status, today, { year })`: monthly value of members still active 60 days after a coach
  checked in (`interventionOutcome`), per currency, each member once. Shown with `KEPT_CAVEAT`.

Tests: `packages/core/test/atrisk.test.ts` covers points, thresholds, wording, `ownerView` stripping, rosters,
currencies, trend gaps and kept.

## Privacy boundary

| | Coach | Owner |
|---|---|---|
| Engagement (sessions, app opens, check-ins, payment) | yes, for clients they can see | yes |
| Physiology (reads, fuel, pain, progress, cycle) | only what each athlete shared, computed on the coach's device | never; one neutral flag line instead |
| Money | no | yes |

- **SQL, owner side.** `20261023040001_atrisk.sql` never reads `daily_checks`, `ease_reads`, cycle, fuel or
  pain. A SQL test checks the function bodies for those names.
- **Coach side.** Physiology comes from the shared projections only (`spotter.reads`, and the fuel, pain,
  cycle and progress keys below). Connected builds need the equivalent "shared only" RPCs.

## What's built

### Coach app
- **Clients → "Needs attention"** chip (`apps/coach/src/atrisk/AtRiskList.tsx`, a small edit in
  `app/(tabs)/clients.tsx`).
  - Ordered by level, then points.
  - Each row: name, the level in words, the top two reasons. Tap opens the client.
  - States: loading, error with Try again, "Nobody needs a check-in right now", search.
- **Client detail → "Between sessions"** (`BetweenSessionsSection`, registered in `ClientSections.tsx`).
  - Shows: running-tired days this week, the fuel check, pain, last best or weeks since, and cycle phase,
    each only if shared. Lines worth raising are bold.
  - **What to ask**: up to three questions in coach language. Fuel points to a doctor or sports dietitian;
    it never diagnoses.
  - Copy in `src/atrisk/summary.ts`.
- **Me → Retention** (owner only, `OwnerOnly` in `MeRows.tsx`). The row's subtitle is MRR at risk and the
  member count. `app/retention.tsx` shows the per-currency headline, high/medium split, 12 weekly bars
  (with a text alternative), MRR kept this year, a link to Members to talk to, and how it's worked out.

### Web dashboard
- **`/dashboard/retention`** (in `src/nav.ts`):
  - MRR at risk per currency, with the high/medium split and member count.
  - A 12-week SVG bar chart with `<title>`/`<desc>`, a text summary and a "Show as a table" table.
  - Kept after a check-in this year, with the caveat.
  - Members to talk to, with owner-safe reasons and a link to `/dashboard/members` to ask a coach.
  - The points table, with physiology rows shown only as "Something the athlete shared with their coach".
- **"Live".** The demo recomputes from current demo data on every load. With an owner Supabase session and
  `NEXT_PUBLIC_TENANT_ID`, `src/retention.ts` reads `mrr_at_risk`, the snapshots, `members_at_risk` and
  `kept_summary` instead.
- **Phone width.** At ≤ 640px the dashboard nav becomes a sticky, horizontally scrolling top bar, and content
  has 16px gutters.
  - The main column is `minmax(0, 1fr)` with `min-width: 0`, so wide tables (Programs) scroll inside their
    own container, not the page.
  - The current page is marked with `aria-current` (`src/DashboardNav.tsx`).

### Database (`20261023040001_atrisk.sql`)
- **`engagement_inputs(t, today)`:** internal, service role only. It's `member_risk_inputs` without easy-day reads.
- **`engagement_points(...)`:** the `memberRisk` points in SQL, with easy-day reads at zero.
- **`monthly_value_cents(...)`:** `monthlyRevenueCents` in SQL.
- **`mrr_at_risk_for(t, today)`:** internal, service role only. Per currency high/medium/total cents and
  counts, with the same filters as the app (live members, two weeks of history).
- **`mrr_at_risk(tenant)`:** `security definer`, owner only (`is_owner`). Anyone else gets `42501`.
- **`mrr_at_risk_snapshots (tenant_id, week_start, currency, high_cents, medium_cents, members)`:**
  - RLS lets the owner read.
  - No write policies, so nobody signed in can write.
- **`snapshot_mrr_at_risk(on_day)`:** service role only. Upserts this week's row per tenant and currency.
  **Not scheduled.** Suggested pg_cron line:
  `select cron.schedule('mrr-at-risk-weekly', '17 4 * * 1', $$ select public.snapshot_mrr_at_risk(current_date) $$);`
- **`client_engagement_inputs(t)`:** for coaches. Engagement only, for the clients `can_see_client` allows,
  with no prices. It feeds the coach roster in connected builds.
- **Tests:** `tests/86_atrisk.test.sql`.
  - Per-currency figures and the two-week rule.
  - Assistant, client and other-tenant owner get `42501`.
  - Tenant B sees only its own data.
  - The internal functions and the snapshot job aren't callable by `authenticated`.
  - No health tables in function bodies.
  - Snapshot RLS for every role.
  - Coach inputs are scoped to their clients.

## Mock data (labelled MOCK)
`packages/core/src/demo/atrisk.ts`:
- **`demoPhysiology()`:** what the sample clients share with their coach.
  - Jordan: fuel, one to watch.
  - Aisha: left shoulder pain, and no best in 9 weeks.
  - Mei: running tired 5 of 7, and the fuel check flagged.
  - Fatima: progress stalled.
  - Priya, Tomás, Chris and Daniel share nothing.
- **`demoMrrSnapshots()`:** 12 weekly USD snapshots ending this week, relative to `Date.now()`.

On the demo today this gives Mei and Chris high, and Aisha and Priya medium. The owner sees Aisha only as
"Their coach has flagged something worth a check-in".

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
- physiology.ts lost an unused `CYCLE_PHASES` import, which was failing `pnpm lint`. No shapes changed.

## Gaps
- **Coach flags never reach the owner's live figure.** `mrr_at_risk` is engagement only by design (no
  health tables), so live MRR at risk leaves out members whose only signals are physiology. The demo
  includes them through `ownerView`. Closing this needs a coach-set "worth a check-in" flag table that holds
  no health detail, which `mrr_at_risk_for` could then count.
- **The existing Members to talk to screens** still show `memberRisk`'s "Rough recovery: N easy-day reads",
  which derives from daily checks. Consider switching them to `ownerRoster` so the owner sees the neutral
  line instead.
- **Physiology adapters are guesses** at the other builds' demo shapes. Connected builds need shared-only
  RPCs for fuel, pain, cycle and progress.
- **The web dashboard has no sign-in.** The live path runs only when an owner Supabase session and
  `NEXT_PUBLIC_TENANT_ID` exist.
- **The weekly snapshot job isn't scheduled.**
- **Small rule differences:** members without a subscription count under the tenant's first plan currency
  (or `usd`) with no value. Tenure is counted in calendar days in the app and from noon UTC in SQL, so a
  member can differ by a day around the two-week line.
