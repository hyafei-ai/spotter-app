import { monthlyRevenueCents } from './grow';
import type { BodyRegion, FuelLevel, PhysiologySignals } from './physiology';
import { MIN_TENURE_DAYS, toSignals, type Intervention, type MemberActivity, type MemberStatus } from './retention';
import { interventionOutcome, memberRisk, type MemberRisk, type RiskLevel } from './signals';

/**
 * Drop-out risk with physiology reasons (coach) and MRR at risk (owner). docs/features/at-risk.md.
 *
 * Builds on memberRisk (signals.ts), which stays as it is. Physiology adds transparent points, each
 * with a reason in coach language. The owner gets the same level through ownerView, with every
 * physiology reason replaced by one neutral line: the owner never sees an athlete's health data.
 *
 * Easy-day reads move from the engagement side to the physiology side ("Running tired"), so they
 * count only when the athlete shared them, and never reach the owner. memberRisk is called here with
 * easeReads zeroed for that reason.
 */

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);
const isoOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

/* ---------- points ---------- */

/** The physiology points, in one place so the UI's "how it's worked out" table can't drift from the rule. */
export const PHYSIOLOGY_POINTS = {
  runningTired: 2,
  fuelTalkToSomeone: 2,
  fuelWatch: 1,
  painOngoing: 2,
  progressStalled: 1,
} as const;

/**
 * Points behind each memberRisk reason, keyed by how the reason starts. memberRisk returns reasons
 * only, so this lets the roster put the heaviest reasons first. A test covers every reason.
 */
const ENGAGEMENT_POINTS: [prefix: string, points: number][] = [
  ['Sessions fell', 3],
  ['No session in', 2],
  ['Hasn’t opened the app', 2],
  ['Payment failed', 2],
  ['Rough recovery', 1],
  ['Missed ', 1],
  ['In their first two months', 1],
];
export const engagementPoints = (reason: string) => ENGAGEMENT_POINTS.find(([p]) => reason.startsWith(p))?.[1] ?? 1;

/** The full points table, for the explanation on the owner's Retention page and docs. */
export const RISK_POINTS_TABLE: { signal: string; points: number; owner: 'shown' | 'neutral' }[] = [
  { signal: 'Sessions fell to half of plan or less (last 2 weeks vs the 2 before)', points: 3, owner: 'shown' },
  { signal: 'No session in 10+ days', points: 2, owner: 'shown' },
  { signal: 'Hasn’t opened the app in 7+ days', points: 2, owner: 'shown' },
  { signal: 'Payment failed', points: 2, owner: 'shown' },
  { signal: 'Missed 2+ weekly check-ins', points: 1, owner: 'shown' },
  { signal: 'In their first two months (only with another signal)', points: 1, owner: 'shown' },
  { signal: 'Running tired: easier-day reads on 4+ of the last 7 days (shared)', points: PHYSIOLOGY_POINTS.runningTired, owner: 'neutral' },
  { signal: 'Fuel check says talk to someone (shared)', points: PHYSIOLOGY_POINTS.fuelTalkToSomeone, owner: 'neutral' },
  { signal: 'Fuel check says watch (shared)', points: PHYSIOLOGY_POINTS.fuelWatch, owner: 'neutral' },
  { signal: 'Ongoing pain: 3+ days in 14, or a level of 6+ (shared)', points: PHYSIOLOGY_POINTS.painOngoing, owner: 'neutral' },
  { signal: 'No new best in 8 weeks of steady training (shared)', points: PHYSIOLOGY_POINTS.progressStalled, owner: 'neutral' },
];

/* ---------- inputs ---------- */

/**
 * Optional detail that makes the reasons specific ("Left knee pain for 4 days"). Not part of the
 * shared PhysiologySignals contract: callers that have it pass it alongside, callers that don't get
 * the general wording.
 */
export interface PhysiologyDetail {
  /** Easier-day reads in the last 7 days, from shared reads. */
  tiredDays?: number | null;
  /** The region logged most in the last 14 days, and on how many days. */
  pain?: { region: BodyRegion; side: 'left' | 'right' | 'both' | null; days: number } | null;
  /** Weeks since the last new best, when known. */
  weeksSinceBest?: number | null;
}
export type PhysiologyInput = PhysiologySignals & PhysiologyDetail;

export type RiskFactorKind = 'engagement' | 'physiology' | 'coach_flag';
export interface RiskFactor {
  kind: RiskFactorKind;
  text: string;
  points: number;
}

/** memberRisk's shape (level, points, reasons as plain strings, strongest first), plus the factors behind them. */
export interface DropoutRisk extends MemberRisk {
  factors: RiskFactor[];
}

const REGION_LABEL: Record<BodyRegion, string> = {
  neck: 'neck',
  shoulder: 'shoulder',
  elbow: 'elbow',
  wrist: 'wrist',
  upper_back: 'upper back',
  lower_back: 'lower back',
  hip: 'hip',
  knee: 'knee',
  ankle: 'ankle',
  foot: 'foot',
  other: '',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function painRiskText(p: PhysiologyDetail['pain']): string {
  if (!p) return 'Ongoing pain logged';
  const where = [p.side === 'left' || p.side === 'right' ? p.side : p.side === 'both' ? 'both' : '', REGION_LABEL[p.region]].filter(Boolean).join(' ');
  const days = `${p.days} day${p.days === 1 ? '' : 's'}`;
  return where ? `${cap(where)} pain for ${days}` : `Pain logged on ${days}`;
}

export const FUEL_RISK_REASON: Record<Exclude<FuelLevel, 'none'>, string> = {
  talk_to_someone: 'Fuel check flagged',
  watch: 'Fuel check: one to watch',
};

function physiologyFactors(p: PhysiologyInput): RiskFactor[] {
  const out: RiskFactor[] = [];
  if (p.runningTired) {
    const text = p.tiredDays != null && p.tiredDays >= 4 ? `Running tired ${p.tiredDays} of the last 7 days` : 'Running tired most of this week';
    out.push({ kind: 'physiology', text, points: PHYSIOLOGY_POINTS.runningTired });
  }
  if (p.fuelLevel === 'talk_to_someone') out.push({ kind: 'physiology', text: FUEL_RISK_REASON.talk_to_someone, points: PHYSIOLOGY_POINTS.fuelTalkToSomeone });
  else if (p.fuelLevel === 'watch') out.push({ kind: 'physiology', text: FUEL_RISK_REASON.watch, points: PHYSIOLOGY_POINTS.fuelWatch });
  if (p.painOngoing) out.push({ kind: 'physiology', text: painRiskText(p.pain), points: PHYSIOLOGY_POINTS.painOngoing });
  if (p.progressStalled) {
    const w = p.weeksSinceBest != null && p.weeksSinceBest >= 8 ? p.weeksSinceBest : 8;
    out.push({ kind: 'physiology', text: `No new best in ${w} weeks`, points: PHYSIOLOGY_POINTS.progressStalled });
  }
  return out;
}

const levelFor = (points: number): RiskLevel => (points >= 5 ? 'high' : points >= 3 ? 'medium' : 'low');
const TENURE_REASON = 'In their first two months';

/**
 * Engagement (memberRisk, without easy-day reads) plus physiology the athlete shared. `physio` is
 * null when nothing was shared, and the result is then engagement only. Same thresholds as
 * memberRisk: ≥ 5 high, 3–4 medium. A member in their first two months gets the +1 when either side
 * has a signal, once.
 */
export function athleteDropoutRisk(activity: MemberActivity, physio: PhysiologyInput | null, today: string): DropoutRisk {
  const signals = { ...toSignals(activity, today), easeReadsRecent: 0, easeReadsBefore: 0 };
  const base = memberRisk(signals);
  const factors: RiskFactor[] = base.reasons.map((text) => ({ kind: 'engagement', text, points: engagementPoints(text) }));
  const physical = physio ? physiologyFactors(physio) : [];
  factors.push(...physical);
  const hasTenure = base.reasons.includes(TENURE_REASON);
  if (!hasTenure && physical.length && signals.tenureDays < 60) factors.push({ kind: 'engagement', text: TENURE_REASON, points: 1 });
  // Strongest first; ties keep engagement before physiology, in memberRisk's order.
  const ordered = factors.map((f, i) => ({ f, i })).sort((a, b) => b.f.points - a.f.points || a.i - b.i).map((x) => x.f);
  const points = ordered.reduce((n, f) => n + f.points, 0);
  return { level: levelFor(points), points, reasons: ordered.map((f) => f.text), factors: ordered };
}

/* ---------- the owner's view ---------- */

/** What the owner reads in place of any physiology reason. No health detail, on purpose. */
export const OWNER_NEUTRAL_REASON = 'Their coach has flagged something worth a check-in';

/**
 * The owner's copy of a risk: same level and points, engagement reasons kept, every physiology
 * reason collapsed into OWNER_NEUTRAL_REASON (once, where the first one was).
 */
export function ownerView(risk: DropoutRisk): DropoutRisk {
  const factors: RiskFactor[] = [];
  let flag: RiskFactor | null = null;
  for (const f of risk.factors) {
    if (f.kind === 'engagement') factors.push(f);
    else if (!flag) {
      flag = { kind: 'coach_flag', text: OWNER_NEUTRAL_REASON, points: f.points };
      factors.push(flag);
    } else flag.points += f.points;
  }
  return { level: risk.level, points: risk.points, reasons: factors.map((f) => f.text), factors };
}

/* ---------- lists ---------- */

export interface AtRiskMember {
  clientId: string;
  name: string;
  coachId: string | null;
  planName: string | null;
  risk: DropoutRisk;
  monthlyCents: number;
  currency: string | null;
}

const LEVEL_ORDER: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };
const isLive = (a: MemberActivity) => !a.subscription || !['canceled', 'paused'].includes(a.subscription.status);
const tenure = (a: MemberActivity, today: string) => dayNum(today) - dayNum(a.joinedAt);

/**
 * Everyone live and past their first two weeks, with their risk, most urgent first (level, then
 * points, then name). The coach roster shows high and medium; `includeLow` keeps the rest.
 */
export function atRiskRoster(
  activity: (MemberActivity & { currency?: string | null })[],
  physio: Record<string, PhysiologyInput | null | undefined>,
  today: string,
  opts: { includeLow?: boolean } = {},
): AtRiskMember[] {
  return activity
    .filter((a) => isLive(a) && tenure(a, today) >= MIN_TENURE_DAYS)
    .map((a) => ({
      clientId: a.clientId,
      name: a.name,
      coachId: a.coachId,
      planName: a.planName,
      risk: athleteDropoutRisk(a, physio[a.clientId] ?? null, today),
      monthlyCents: a.subscription ? monthlyRevenueCents(a.subscription) : 0,
      currency: a.currency ?? null,
    }))
    .filter((m) => opts.includeLow || m.risk.level !== 'low')
    .sort((a, b) => LEVEL_ORDER[a.risk.level] - LEVEL_ORDER[b.risk.level] || b.risk.points - a.risk.points || a.name.localeCompare(b.name));
}

/** The owner's list: the same members and levels, with owner-safe reasons only. */
export function ownerRoster(
  activity: (MemberActivity & { currency?: string | null })[],
  physio: Record<string, PhysiologyInput | null | undefined>,
  today: string,
): AtRiskMember[] {
  return atRiskRoster(activity, physio, today)
    .map((m) => ({ ...m, risk: ownerView(m.risk) }))
    .sort((a, b) => LEVEL_ORDER[a.risk.level] - LEVEL_ORDER[b.risk.level] || b.monthlyCents - a.monthlyCents || a.name.localeCompare(b.name));
}

/** Coach copy for a level. Never "churn" or "at risk" (docs/jtbd.md, coach job). */
export const COACH_LEVEL_TEXT: Record<RiskLevel, string> = {
  high: 'Needs a check-in soon',
  medium: 'Worth watching',
  low: 'On track',
};

/* ---------- MRR at risk ---------- */

export interface MrrAtRiskRow {
  currency: string;
  highCents: number;
  mediumCents: number;
  totalCents: number;
  /** High and medium members in this currency (including any with no recurring value). */
  count: number;
  highCount: number;
  mediumCount: number;
}

/**
 * Monthly recurring revenue from high and medium members, one row per currency. Amounts are never
 * added across currencies. Rows are sorted by total, largest first.
 */
export function mrrAtRisk(members: { monthlyCents: number; level: RiskLevel; currency: string }[]): MrrAtRiskRow[] {
  const by = new Map<string, MrrAtRiskRow>();
  for (const m of members) {
    if (m.level === 'low') continue;
    const row = by.get(m.currency) ?? { currency: m.currency, highCents: 0, mediumCents: 0, totalCents: 0, count: 0, highCount: 0, mediumCount: 0 };
    const cents = Math.max(0, Math.round(m.monthlyCents));
    if (m.level === 'high') {
      row.highCents += cents;
      row.highCount += 1;
    } else {
      row.mediumCents += cents;
      row.mediumCount += 1;
    }
    row.totalCents += cents;
    row.count += 1;
    by.set(m.currency, row);
  }
  return [...by.values()].sort((a, b) => b.totalCents - a.totalCents || a.currency.localeCompare(b.currency));
}

/** Monday of the week `iso` falls in (UTC), as YYYY-MM-DD. Snapshots are keyed by it. */
export function riskWeekStart(iso: string): string {
  const n = dayNum(iso);
  // 1970-01-01 was a Thursday: (n + 3) % 7 is days since Monday.
  return isoOf(n - ((((n + 3) % 7) + 7) % 7));
}

export interface MrrSnapshot {
  weekStart: string;
  currency: string;
  highCents: number;
  mediumCents: number;
  members: number;
}
export interface MrrTrendPoint {
  weekStart: string;
  /** null when there's no snapshot for that week (never shown as zero). */
  totalCents: number | null;
  highCents: number | null;
  mediumCents: number | null;
  members: number | null;
}
export interface MrrTrend {
  currency: string;
  /** Oldest first, exactly `weeks` long, ending with this week. */
  points: MrrTrendPoint[];
  /** Latest minus the earliest week with data, when both exist and differ. */
  changeCents: number | null;
}

/**
 * Weekly MRR at risk for the last `weeks` weeks (default 12), one series per currency. `current`
 * (the live figure) replaces this week's snapshot, so the last point always matches the headline.
 */
export function mrrAtRiskTrend(snapshots: MrrSnapshot[], today: string, opts: { weeks?: number; current?: MrrAtRiskRow[] } = {}): MrrTrend[] {
  const weeks = opts.weeks ?? 12;
  const end = riskWeekStart(today);
  const starts = Array.from({ length: weeks }, (_, i) => isoOf(dayNum(end) - (weeks - 1 - i) * 7));
  const currencies = new Set([...snapshots.map((s) => s.currency), ...(opts.current ?? []).map((c) => c.currency)]);
  return [...currencies].sort().map((currency) => {
    const points = starts.map((ws): MrrTrendPoint => {
      const live = ws === end ? opts.current?.find((c) => c.currency === currency) : undefined;
      if (live) return { weekStart: ws, totalCents: live.totalCents, highCents: live.highCents, mediumCents: live.mediumCents, members: live.count };
      if (ws === end && opts.current) return { weekStart: ws, totalCents: 0, highCents: 0, mediumCents: 0, members: 0 };
      const s = snapshots.find((x) => x.currency === currency && riskWeekStart(x.weekStart) === ws);
      return s
        ? { weekStart: ws, totalCents: s.highCents + s.mediumCents, highCents: s.highCents, mediumCents: s.mediumCents, members: s.members }
        : { weekStart: ws, totalCents: null, highCents: null, mediumCents: null, members: null };
    });
    const known = points.filter((p) => p.totalCents != null);
    const changeCents = known.length >= 2 ? known[known.length - 1]!.totalCents! - known[0]!.totalCents! : null;
    return { currency, points, changeCents };
  });
}

/* ---------- MRR kept after a check-in ---------- */

export interface MrrKeptRow {
  currency: string;
  /** Monthly value of members still active 60 days after a coach checked in. */
  monthlyCents: number;
  count: number;
}

/**
 * Monthly value kept after check-ins, per currency, each member once (their latest kept check-in).
 * Uses interventionOutcome: kept = still active 60 days after the coach checked in. With `year`,
 * only check-ins done that year count.
 */
export function mrrKept(
  interventions: (Intervention & { currency?: string | null })[],
  status: MemberStatus,
  today: string,
  opts: { year?: number; currency?: string } = {},
): MrrKeptRow[] {
  const seen = new Set<string>();
  const by = new Map<string, MrrKeptRow>();
  const done = interventions
    .filter((i) => i.doneOn && (opts.year == null || i.doneOn.startsWith(String(opts.year))))
    .sort((a, b) => b.doneOn!.localeCompare(a.doneOn!));
  for (const i of done) {
    if (seen.has(i.clientId)) continue;
    const s = status[i.clientId] ?? { active: false, leftOn: null };
    if (interventionOutcome(i.doneOn!, s.active, s.leftOn, today) !== 'kept') continue;
    seen.add(i.clientId);
    const currency = i.currency ?? opts.currency ?? 'usd';
    const row = by.get(currency) ?? { currency, monthlyCents: 0, count: 0 };
    row.monthlyCents += Math.max(0, i.monthlyCents);
    row.count += 1;
    by.set(currency, row);
  }
  return [...by.values()].sort((a, b) => b.monthlyCents - a.monthlyCents || a.currency.localeCompare(b.currency));
}

/* ---------- rows from the database ---------- */

/** A row from mrr_at_risk(tenant). */
export interface MrrAtRiskDbRow {
  currency: string;
  high_cents: number;
  medium_cents: number;
  total_cents: number;
  members: number;
  high_members: number;
  medium_members: number;
}
export const mrrFromRow = (r: MrrAtRiskDbRow): MrrAtRiskRow => ({
  currency: r.currency,
  highCents: Number(r.high_cents),
  mediumCents: Number(r.medium_cents),
  totalCents: Number(r.total_cents),
  count: Number(r.members),
  highCount: Number(r.high_members),
  mediumCount: Number(r.medium_members),
});

/** A row from mrr_at_risk_snapshots. */
export interface MrrSnapshotDbRow {
  week_start: string;
  currency: string;
  high_cents: number;
  medium_cents: number;
  members: number;
}
export const snapshotFromRow = (r: MrrSnapshotDbRow): MrrSnapshot => ({
  weekStart: r.week_start.slice(0, 10),
  currency: r.currency,
  highCents: Number(r.high_cents),
  mediumCents: Number(r.medium_cents),
  members: Number(r.members),
});
