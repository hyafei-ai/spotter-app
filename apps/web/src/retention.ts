import { createClient } from '@supabase/supabase-js';
import {
  activityFromRow,
  memberStatus,
  monthlyRevenueCents,
  mrrAtRisk,
  mrrAtRiskTrend,
  mrrFromRow,
  mrrKept,
  ownerRoster,
  type Intervention,
  snapshotFromRow,
  type AtRiskMember,
  type MemberRiskInputRow,
  type MemberStatus,
  type MrrAtRiskDbRow,
  type MrrAtRiskRow,
  type MrrKeptRow,
  type MrrSnapshotDbRow,
  type MrrTrend,
} from '@spotter/core';
import { DEMO_PLANS, demoInterventions, demoMemberActivity, demoMrrSnapshots, demoPhysiology, demoRetentionSubscriptions } from '@spotter/core/demo';
import { demoClients, demoTenant } from './platformDemo';

/*
 * Data for /dashboard/retention, "Keeping clients": the coach's business view (owner role). Income at
 * risk, the trend, who could use a check-in with reasons, and who stayed after one.
 * - Reasons: full for the coach's own clients. Teams only: for a client an assistant coaches, what
 *   they shared stays with that coach and shows as one neutral line (reasonsFor in core).
 * - Demo (MOCK): recomputed on every load from the sample clients, the physiology they shared with
 *   their coach, and twelve weeks of sample snapshots, with the same functions as live data. Check-ins
 *   asked in the demo are kept in localStorage (spotter.retention.<slug>), like the coach app's demo.
 * - Connected (the business's coach signed in to Supabase in this browser): mrr_at_risk(tenant) for
 *   this week, the owner-only mrr_at_risk_snapshots table for earlier weeks, members_at_risk and
 *   kept_summary. The browser has no physiology, so live reasons are engagement only. The dashboard
 *   has no sign-in yet, so in practice this falls back to the demo.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID;

export interface RetentionData {
  source: 'demo' | 'live';
  today: string;
  atRisk: MrrAtRiskRow[];
  trend: MrrTrend[];
  kept: MrrKeptRow[];
  year: number;
  /** Who could use a check-in, with the reasons this viewer may read (reasonsFor). */
  clients: AtRiskMember[];
  /** Every check-in, for the kept list and "asked" state. */
  interventions: Intervention[];
  status: MemberStatus;
  /** The signed-in coach (demo: 'owner'), for reasonsFor and "You". */
  viewerId: string;
  currency: string;
  loadedAt: string;
}

export const RETENTION_KEY = (slug: string) => `spotter.retention.${slug}`;

function savedInterventions(): Intervention[] | null {
  try {
    const raw = globalThis.localStorage?.getItem(RETENTION_KEY(demoTenant.slug));
    return raw ? (JSON.parse(raw) as Intervention[]) : null;
  } catch {
    return null;
  }
}

/** Demo: keep a check-in asked here (teams only) for the next visit. */
export function saveDemoInterventions(list: Intervention[]) {
  try {
    globalThis.localStorage?.setItem(RETENTION_KEY(demoTenant.slug), JSON.stringify(list));
  } catch {
    // storage unavailable: kept for this visit only
  }
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function loadDemoRetention(now = Date.now()): RetentionData {
  const today = new Date(now).toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const currency = DEMO_PLANS[0]?.currency ?? 'usd';
  const coachOf = Object.fromEntries(demoClients.map((c) => [c.id, c.coachId]));
  const viewerId = 'owner';
  const clients = ownerRoster(
    demoMemberActivity(now, coachOf).map((a) => ({ ...a, currency })),
    demoPhysiology(),
    today,
    // The demo business is a solo coach (the main case): every reason is shown, no hand-offs.
    { viewerId, solo: true },
  );
  const atRisk = mrrAtRisk(clients.map((m) => ({ monthlyCents: m.monthlyCents, level: m.risk.level, currency: m.currency ?? currency })));
  const interventions = savedInterventions() ?? demoInterventions(now).map((i) => ({ ...i, coachId: viewerId, coachName: 'Maya Reyes' }));
  const status = memberStatus(demoRetentionSubscriptions(now));
  return {
    source: 'demo',
    today,
    atRisk,
    trend: mrrAtRiskTrend(demoMrrSnapshots(now), today, { current: atRisk }),
    kept: mrrKept(interventions, status, today, { year, currency }),
    year,
    clients,
    interventions,
    status,
    viewerId,
    currency,
    loadedAt: new Date(now).toISOString(),
  };
}

interface KeptDbRow {
  intervention_id: string;
  client_id: string;
  client_name: string;
  coach_id: string;
  coach_name: string;
  reason: string;
  requested_at: string;
  done_at: string | null;
  action: Intervention['action'];
  action_note: string | null;
  still_active: boolean;
  left_on: string | null;
  plan_kind: MemberRiskInputRow['plan_kind'];
  price_cents: number | null;
  discount_cents: number | null;
  duration_weeks: number | null;
  currency: string | null;
}

/** Live figures when an owner session exists in this browser; otherwise null (the page shows the demo). */
export async function loadLiveRetention(): Promise<RetentionData | null> {
  if (!SUPABASE_URL || !ANON || !TENANT_ID) return null;
  const supabase = createClient(SUPABASE_URL, ANON);
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return null;
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const since = new Date(Date.now() - 12 * 7 * 86_400_000).toISOString().slice(0, 10);
  const [live, snaps, inputs, keptRows] = await Promise.all([
    supabase.rpc('mrr_at_risk', { tenant: TENANT_ID }),
    supabase.from('mrr_at_risk_snapshots').select('week_start, currency, high_cents, medium_cents, members').eq('tenant_id', TENANT_ID).gte('week_start', since),
    supabase.rpc('members_at_risk', { t: TENANT_ID }),
    supabase.rpc('kept_summary', { t: TENANT_ID, yr: year }),
  ]);
  if (live.error || snaps.error || inputs.error || keptRows.error) throw new Error('Couldn’t load retention.');
  const atRisk = ((live.data ?? []) as MrrAtRiskDbRow[]).map(mrrFromRow);
  // The browser never has physiology, so live lists are engagement only (see docs gaps).
  const viewerId = session.session.user.id;
  const inputRows = (inputs.data ?? []) as (MemberRiskInputRow & { currency: string | null })[];
  const clients = ownerRoster(
    inputRows.map((r) => ({ ...activityFromRow(r), currency: r.currency })),
    {},
    today,
    { viewerId },
  );
  const rows = (keptRows.data ?? []) as KeptDbRow[];
  const status: MemberStatus = Object.fromEntries(rows.map((r) => [r.client_id, { active: r.still_active, leftOn: r.left_on }]));
  const interventions = rows.map((r): Intervention & { currency: string | null } => ({
    id: r.intervention_id,
    clientId: r.client_id,
    clientName: r.client_name,
    coachId: r.coach_id,
    coachName: r.coach_name,
    reason: r.reason,
    note: null,
    requestedOn: r.requested_at.slice(0, 10),
    doneOn: r.done_at?.slice(0, 10) ?? null,
    action: r.action,
    actionNote: r.action_note,
    currency: r.currency,
    monthlyCents:
      r.plan_kind && r.price_cents != null
        ? monthlyRevenueCents({
            clientId: r.client_id,
            planKind: r.plan_kind,
            priceCents: r.price_cents,
            discountCents: r.discount_cents ?? 0,
            status: 'active',
            startedAt: r.requested_at,
            trialEndsAt: null,
            canceledAt: null,
            durationWeeks: r.duration_weeks,
          })
        : 0,
  }));
  return {
    source: 'live',
    today,
    atRisk,
    trend: mrrAtRiskTrend(((snaps.data ?? []) as MrrSnapshotDbRow[]).map(snapshotFromRow), today, { current: atRisk }),
    kept: mrrKept(interventions, status, today, { year }),
    year,
    clients,
    interventions,
    status,
    viewerId,
    currency: inputRows.find((r) => r.currency)?.currency ?? rows.find((r) => r.currency)?.currency ?? 'usd',
    loadedAt: new Date().toISOString(),
  };
}
