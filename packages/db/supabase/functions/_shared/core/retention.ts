// GENERATED from packages/core/src/retention.ts by scripts/sync-schemas.mjs. Do not edit.
import { formatMoney, monthlyRevenueCents, type Currency, type SubscriptionLike } from './grow.ts';
import { interventionOutcome, memberRisk, yearlyValueCents, type InterventionOutcome, type MemberRisk, type MemberSignals } from './signals.ts';

/**
 * Owner job (docs/jtbd.md): show coaches who to check in with before a member leaves, and show which
 * members stayed after a coach did. Assembles raw activity into the signals in signals.ts; the rules
 * themselves live there. Values come from the member's real subscription only.
 */

const DAY = 86_400_000;
const days = (from: string | null, today: string) =>
  from == null ? null : Math.max(0, Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(from)) / DAY));

/** One member's raw activity, as returned by member_risk_inputs() or built from demo data. */
export interface MemberActivity {
  clientId: string;
  name: string;
  planName: string | null;
  coachId: string | null;
  /** Sessions done vs planned in each of the last 4 weeks, oldest first. */
  weeks: { planned: number; done: number }[];
  lastAppOpenAt: string | null;
  lastSessionAt: string | null;
  /** Easy-day reads in the last 14 days and the 14 before (0 until daily checks exist). */
  easeReadsRecent: number;
  easeReadsBefore: number;
  checkInsMissed: number;
  /** When they joined (membership created). */
  joinedAt: string;
  subscription: SubscriptionLike | null;
}

export function toSignals(a: MemberActivity, today: string): MemberSignals {
  return {
    weeks: a.weeks,
    daysSinceLastOpen: days(a.lastAppOpenAt, today),
    daysSinceLastSession: days(a.lastSessionAt, today),
    // Owner path: easy-day reads come from athletes' daily checks, which owners never see
    // (docs/physiology.md rule 4). Coaches get tiredness through atrisk.ts, from shared reads only.
    easeReadsRecent: 0,
    easeReadsBefore: 0,
    checkInsMissed: a.checkInsMissed,
    paymentIssue: a.subscription?.status === 'past_due' || a.subscription?.status === 'unpaid',
    tenureDays: days(a.joinedAt, today) ?? 0,
  };
}

export interface MemberAssessment {
  clientId: string;
  name: string;
  planName: string | null;
  coachId: string | null;
  risk: MemberRisk;
  /** Normalised monthly revenue from their subscription; 0 for pay-as-you-go packs or no plan. */
  monthlyCents: number;
  /** monthly × 12, or null when there's no recurring value to show. */
  yearlyCents: number | null;
}

/** Members need two weeks of history before a read means anything. */
export const MIN_TENURE_DAYS = 14;

const LEVEL_ORDER = { high: 0, medium: 1, low: 2 } as const;

export interface MembersToTalkTo {
  /** High and medium, most urgent first, then by yearly value. */
  members: MemberAssessment[];
  /** Members too new to read yet. */
  tooNew: number;
  /** Members considered at all (not paused or ended). */
  considered: number;
}

export function membersToTalkTo(activity: MemberActivity[], today: string): MembersToTalkTo {
  const live = activity.filter((a) => !a.subscription || !['canceled', 'paused'].includes(a.subscription.status));
  const tenure = (a: MemberActivity) => days(a.joinedAt, today) ?? 0;
  const members = live
    .filter((a) => tenure(a) >= MIN_TENURE_DAYS)
    .map((a): MemberAssessment => {
      const monthlyCents = a.subscription ? monthlyRevenueCents(a.subscription) : 0;
      return {
        clientId: a.clientId,
        name: a.name,
        planName: a.planName,
        coachId: a.coachId,
        risk: memberRisk(toSignals(a, today)),
        monthlyCents,
        yearlyCents: monthlyCents > 0 ? yearlyValueCents(monthlyCents) : null,
      };
    })
    .filter((m) => m.risk.level !== 'low')
    .sort(
      (a, b) =>
        LEVEL_ORDER[a.risk.level] - LEVEL_ORDER[b.risk.level] || (b.yearlyCents ?? 0) - (a.yearlyCents ?? 0) || a.name.localeCompare(b.name),
    );
  return { members, tooNew: live.filter((a) => tenure(a) < MIN_TENURE_DAYS).length, considered: live.length };
}

/** "≈ $1,920", rounded to whole units: these are estimates. */
export function approxMoney(cents: number, currency: Currency | string): string {
  const c = (['usd', 'gbp', 'eur', 'cad', 'aud'] as const).find((x) => x === currency) ?? 'usd';
  return `≈ ${formatMoney(Math.round(cents / 100) * 100, c)}`;
}

/** The assumption behind a yearly figure, spelled out next to it. */
export function yearlyAssumption(monthlyCents: number, currency: Currency | string): string {
  const c = (['usd', 'gbp', 'eur', 'cad', 'aud'] as const).find((x) => x === currency) ?? 'usd';
  return `their plan works out to ${formatMoney(Math.round(monthlyCents / 100) * 100, c)} a month × 12`;
}

/**
 * What Spotter costs the owner per month, for the optional "Spotter costs ≈ $X a year" line.
 * Pricing is still an open question in the spec, so this stays null and the line stays hidden.
 */
export const SPOTTER_PRICE_MONTHLY_CENTS: number | null = null;

/* ---------- handing to a coach, and what happened ---------- */

export type InterventionAction = 'message' | 'call' | 'session' | 'other';
export const INTERVENTION_ACTIONS: { value: InterventionAction; label: string }[] = [
  { value: 'message', label: 'Message' },
  { value: 'call', label: 'Call' },
  { value: 'session', label: 'Session' },
  { value: 'other', label: 'Other' },
];
/** Past tense for the kept list: "Leo · called on May 23". */
export const INTERVENTION_DONE_LABEL: Record<InterventionAction, string> = {
  message: 'messaged',
  call: 'called',
  session: 'talked at a session',
  other: 'checked in',
};

export interface Intervention {
  id: string;
  clientId: string;
  clientName: string;
  coachId: string;
  coachName: string;
  /** The top reason when the owner asked: plain facts, never risk wording. */
  reason: string;
  note: string | null;
  requestedOn: string;
  /** When the coach marked it done, and what they did. */
  doneOn: string | null;
  action: InterventionAction | null;
  actionNote: string | null;
  monthlyCents: number;
}

/** The coach-facing line in their Clients list. Never says churn or risk. */
export function checkInRequestText(ownerFirstName: string, topReason: string): string {
  return `${ownerFirstName} asked you to check in: ${topReason.charAt(0).toLowerCase()}${topReason.slice(1)}`;
}

/** Shown with every kept figure, word for word. */
export const KEPT_CAVEAT =
  'Members still with you 60 days after a coach checked in. This shows they stayed, not that the check-in alone kept them.';

export interface KeptRow extends Intervention {
  outcome: InterventionOutcome | 'waiting';
}

export interface KeptSummary {
  year: number;
  kept: KeptRow[];
  left: KeptRow[];
  pending: KeptRow[];
  /** Asked, but the coach hasn't checked in yet. */
  waiting: KeptRow[];
  keptYearlyCents: number;
}

export type MemberStatus = Record<string, { active: boolean; leftOn: string | null }>;

/**
 * Interventions from `year`, each with its outcome via interventionOutcome: kept = still active 60
 * days after the coach checked in. Status comes from the member's subscription.
 */
export function keptSummary(interventions: Intervention[], status: MemberStatus, year: number, today: string): KeptSummary {
  const rows: KeptRow[] = interventions.map((i) => {
    if (!i.doneOn) return { ...i, outcome: 'waiting' };
    const s = status[i.clientId] ?? { active: false, leftOn: null };
    return { ...i, outcome: interventionOutcome(i.doneOn, s.active, s.leftOn, today) };
  });
  const inYear = rows
    .filter((r) => (r.doneOn ?? r.requestedOn).startsWith(String(year)))
    .sort((a, b) => (b.doneOn ?? b.requestedOn).localeCompare(a.doneOn ?? a.requestedOn));
  const kept = inYear.filter((r) => r.outcome === 'kept');
  return {
    year,
    kept,
    left: inYear.filter((r) => r.outcome === 'left'),
    pending: inYear.filter((r) => r.outcome === 'pending'),
    waiting: inYear.filter((r) => r.outcome === 'waiting'),
    keptYearlyCents: kept.reduce((n, r) => n + yearlyValueCents(r.monthlyCents), 0),
  };
}

/** Status per client for keptSummary: active while any subscription is active, trialing or past due. */
export function memberStatus(subs: SubscriptionLike[]): MemberStatus {
  const out: MemberStatus = {};
  for (const s of subs) {
    const active = ['active', 'trialing', 'past_due'].includes(s.status);
    const prev = out[s.clientId];
    if (prev?.active) continue;
    out[s.clientId] = { active, leftOn: active ? null : (s.canceledAt?.slice(0, 10) ?? prev?.leftOn ?? null) };
  }
  return out;
}

/* ---------- rows from the database ---------- */

/** A row from members_at_risk() / member_risk_inputs(). */
export interface MemberRiskInputRow {
  client_id: string;
  full_name: string;
  coach_id: string | null;
  joined_at: string;
  weeks: { planned: number; done: number }[] | null;
  last_app_open_at: string | null;
  last_session_at: string | null;
  ease_reads_recent: number;
  ease_reads_before: number;
  check_ins_missed: number;
  plan_name: string | null;
  plan_kind: SubscriptionLike['planKind'] | null;
  price_cents: number | null;
  discount_cents: number | null;
  duration_weeks: number | null;
  sub_status: SubscriptionLike['status'] | null;
  started_at: string | null;
  trial_ends_at: string | null;
  canceled_at: string | null;
}

export function activityFromRow(r: MemberRiskInputRow): MemberActivity {
  return {
    clientId: r.client_id,
    name: r.full_name || 'Member',
    planName: r.plan_name,
    coachId: r.coach_id,
    weeks: r.weeks ?? [],
    lastAppOpenAt: r.last_app_open_at,
    lastSessionAt: r.last_session_at,
    easeReadsRecent: r.ease_reads_recent ?? 0,
    easeReadsBefore: r.ease_reads_before ?? 0,
    checkInsMissed: r.check_ins_missed ?? 0,
    joinedAt: r.joined_at,
    subscription:
      r.plan_kind && r.sub_status && r.price_cents != null
        ? {
            clientId: r.client_id,
            planKind: r.plan_kind,
            priceCents: r.price_cents,
            discountCents: r.discount_cents ?? 0,
            status: r.sub_status,
            startedAt: r.started_at ?? r.joined_at,
            trialEndsAt: r.trial_ends_at,
            canceledAt: r.canceled_at,
            durationWeeks: r.duration_weeks,
          }
        : null,
  };
}
