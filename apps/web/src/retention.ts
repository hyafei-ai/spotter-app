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
import { demoClients } from './platformDemo';

/*
 * Owner retention data for /dashboard/retention. Engagement and money only: physiology reaches the
 * owner as one neutral coach flag (ownerView), never as health detail.
 * - Demo (MOCK): recomputed on every load from the sample members, the physiology they shared with
 *   their coach, and twelve weeks of sample snapshots, with the same functions as live data.
 * - Connected (an owner signed in to Supabase in this browser): mrr_at_risk(tenant) for this week,
 *   the owner-only mrr_at_risk_snapshots table for earlier weeks, members_at_risk and kept_summary.
 *   The dashboard has no sign-in yet, so in practice this falls back to the demo (as /dashboard/members does).
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
  /** Owner-safe: reasons have been through ownerView. */
  members: AtRiskMember[];
  loadedAt: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function loadDemoRetention(now = Date.now()): RetentionData {
  const today = new Date(now).toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const currency = DEMO_PLANS[0]?.currency ?? 'usd';
  const coachOf = Object.fromEntries(demoClients.map((c) => [c.id, c.coachId]));
  const members = ownerRoster(
    demoMemberActivity(now, coachOf).map((a) => ({ ...a, currency })),
    demoPhysiology(),
    today,
  );
  const atRisk = mrrAtRisk(members.map((m) => ({ monthlyCents: m.monthlyCents, level: m.risk.level, currency: m.currency ?? currency })));
  return {
    source: 'demo',
    today,
    atRisk,
    trend: mrrAtRiskTrend(demoMrrSnapshots(now), today, { current: atRisk }),
    kept: mrrKept(demoInterventions(now), memberStatus(demoRetentionSubscriptions(now)), today, { year, currency }),
    year,
    members,
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
  // The owner's browser never has physiology, so live lists are engagement only (see docs gaps).
  const members = ownerRoster(
    ((inputs.data ?? []) as (MemberRiskInputRow & { currency: string | null })[]).map((r) => ({ ...activityFromRow(r), currency: r.currency })),
    {},
    today,
  );
  const rows = (keptRows.data ?? []) as KeptDbRow[];
  const status: MemberStatus = Object.fromEntries(rows.map((r) => [r.client_id, { active: r.still_active, leftOn: r.left_on }]));
  const interventions = rows.map((r) => ({
    id: r.intervention_id,
    clientId: r.client_id,
    clientName: r.client_name,
    coachId: r.coach_id,
    coachName: r.coach_name,
    reason: r.reason,
    note: null,
    requestedOn: r.requested_at.slice(0, 10),
    doneOn: r.done_at?.slice(0, 10) ?? null,
    action: null,
    actionNote: null,
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
    members,
    loadedAt: new Date().toISOString(),
  };
}
