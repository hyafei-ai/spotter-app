import { z } from 'zod';
import { isoDate, isoDateTime } from './schemas';

/**
 * Body-variance signals shared by the athlete's daily read, the coach's memory and prep, and the
 * coach's "who needs a check-in" list. Everything here is rule-based and explainable: each output says
 * which inputs produced it. No scores are shown to athletes, and no medical claims are made.
 * See docs/jtbd.md for the jobs these serve.
 */

/* ---------- the daily check (athlete, ~30 seconds) ---------- */

export const CYCLE_PHASES = ['menstrual', 'follicular', 'ovulation', 'luteal'] as const;
export type CyclePhase = (typeof CYCLE_PHASES)[number];
export const CYCLE_PHASE_LABEL: Record<CyclePhase, string> = {
  menstrual: 'Period',
  follicular: 'Follicular',
  ovulation: 'Ovulation',
  luteal: 'Luteal',
};

export const DailyCheck = z.object({
  id: z.string(),
  date: isoDate,
  /** Hours slept last night; from Apple Health / Health Connect when connected, else typed. */
  sleepHours: z.number().min(0).max(16).nullable(),
  sleepSource: z.enum(['health', 'manual']).nullable(),
  /** 1 = flat, 5 = great */
  energy: z.number().int().min(1).max(5).nullable(),
  /** 1 = fresh, 5 = very sore */
  soreness: z.number().int().min(1).max(5).nullable(),
  /** 1 = calm, 5 = very stressed */
  stress: z.number().int().min(1).max(5).nullable(),
  /** Optional and private: only shared with the coach when shareCycle is on. */
  cyclePhase: z.enum(CYCLE_PHASES).nullable(),
  shareCycle: z.boolean(),
  note: z.string().max(300).nullable(),
  /** The read is shared with the coach by default; the athlete can turn it off per day. */
  shareWithCoach: z.boolean(),
  submittedAt: isoDateTime,
});
export type DailyCheck = z.infer<typeof DailyCheck>;

/* ---------- training load (session RPE × minutes) ---------- */

/** Session RPE from the finish screen's "how did it feel" (1 rough … 5 great). An approximation, labelled as such. */
const FEEL_TO_RPE: Record<number, number> = { 1: 9, 2: 8, 3: 7, 4: 6, 5: 5 };

export function sessionLoad(durationMin: number, feel: number | null): number {
  const rpe = feel != null ? (FEEL_TO_RPE[feel] ?? 7) : 7;
  return Math.max(0, Math.round(durationMin)) * rpe;
}

export type LoadStatus = 'spike' | 'drop' | 'steady' | 'unknown';
export interface LoadTrend {
  status: LoadStatus;
  /** Last 7 days of load. */
  acute: number;
  /** Average weekly load over the last 28 days. */
  chronicWeekly: number;
  /** acute ÷ chronicWeekly, null when there isn't enough history. */
  ratio: number | null;
}

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);

/** 7-day vs 28-day load. Needs 21 days of history before it says anything. */
export function loadTrend(sessions: { date: string; load: number }[], today: string): LoadTrend {
  const t = dayNum(today);
  const past = sessions.filter((s) => dayNum(s.date) <= t);
  if (past.length === 0) return { status: 'unknown', acute: 0, chronicWeekly: 0, ratio: null };
  const first = Math.min(...past.map((s) => dayNum(s.date)));
  const within = (days: number) => past.filter((s) => t - dayNum(s.date) < days).reduce((n, s) => n + s.load, 0);
  const acute = within(7);
  const chronicWeekly = within(28) / 4;
  if (t - first < 21 || chronicWeekly === 0) return { status: 'unknown', acute, chronicWeekly, ratio: null };
  const ratio = Math.round((acute / chronicWeekly) * 100) / 100;
  const status: LoadStatus = ratio >= 1.5 ? 'spike' : ratio <= 0.5 ? 'drop' : 'steady';
  return { status, acute, chronicWeekly, ratio };
}

/* ---------- sleep pattern ---------- */

export const SHORT_SLEEP_HOURS = 6.5;

export interface SleepPattern {
  /** Of the last 3 nights with data, how many were short. */
  shortNights: number;
  nightsWithData: number;
  lastNight: number | null;
  /** The athlete's own average over the 14 nights before that, when there are at least 5. */
  baseline: number | null;
}

/** "Short" = under 6.5 h, or more than an hour under the athlete's own recent average. */
export function sleepPattern(checks: Pick<DailyCheck, 'date' | 'sleepHours'>[], today: string): SleepPattern {
  const t = dayNum(today);
  const withSleep = checks.filter((c) => c.sleepHours != null && dayNum(c.date) <= t).sort((a, b) => b.date.localeCompare(a.date));
  const recent = withSleep.filter((c) => t - dayNum(c.date) < 3);
  const older = withSleep.filter((c) => t - dayNum(c.date) >= 3 && t - dayNum(c.date) < 17);
  const baseline = older.length >= 5 ? older.reduce((n, c) => n + c.sleepHours!, 0) / older.length : null;
  const isShort = (h: number) => h < SHORT_SLEEP_HOURS || (baseline != null && h < baseline - 1);
  return {
    shortNights: recent.filter((c) => isShort(c.sleepHours!)).length,
    nightsWithData: recent.length,
    lastNight: recent.find((c) => c.date === today)?.sleepHours ?? null,
    baseline: baseline != null ? Math.round(baseline * 10) / 10 : null,
  };
}

/* ---------- fuelling ---------- */

/** Under-fuelled when the last 3 logged days average under 75% of the calorie target (needs 2+ logged days). */
export function fuelStatus(days: { date: string; kcal: number }[], targetKcal: number | null, today: string): 'low' | 'ok' | 'unknown' {
  if (!targetKcal) return 'unknown';
  const t = dayNum(today);
  const recent = days.filter((d) => t - dayNum(d.date) >= 1 && t - dayNum(d.date) <= 3 && d.kcal > 0);
  if (recent.length < 2) return 'unknown';
  const avg = recent.reduce((n, d) => n + d.kcal, 0) / recent.length;
  return avg < targetKcal * 0.75 ? 'low' : 'ok';
}

/* ---------- the read ---------- */

export type FactorKind =
  | 'sleep_short'
  | 'sleep_ok'
  | 'load_spike'
  | 'load_drop'
  | 'soreness_high'
  | 'energy_low'
  | 'stress_high'
  | 'fuel_low'
  | 'cycle_phase'
  | 'note';

export interface ReadFactor {
  kind: FactorKind;
  /** Plain words, e.g. "Short sleep 2 of the last 3 nights (5.8 h last night)". */
  text: string;
  /** Counts toward easing off. Informational factors (good sleep, cycle phase, a note) don't. */
  strain: boolean;
}

export type ReadTone = 'steady' | 'watch' | 'ease';

export interface DailyRead {
  date: string;
  tone: ReadTone;
  headline: string;
  factors: ReadFactor[];
  /** Offer the coach-approved lighter version of today's session. */
  suggestLighter: boolean;
}

export interface ReadInput {
  today: string;
  check: DailyCheck | null;
  history: Pick<DailyCheck, 'date' | 'sleepHours'>[];
  load: LoadTrend;
  fuel: 'low' | 'ok' | 'unknown';
}

const h = (n: number) => `${Math.round(n * 10) / 10} h`;

/**
 * Turns today's check plus recent sleep, load and fuelling into a short read. Two or more strain
 * factors suggest an easier day; one means "train as planned, keep an eye on it".
 */
export function dailyRead(input: ReadInput): DailyRead {
  const { check, today } = input;
  const factors: ReadFactor[] = [];
  const sleep = sleepPattern(input.history, today);

  if (sleep.nightsWithData > 0) {
    const last = sleep.lastNight != null ? ` (${h(sleep.lastNight)} last night)` : '';
    if (sleep.shortNights >= 2 || (sleep.lastNight != null && sleep.lastNight < 5.5)) {
      factors.push({ kind: 'sleep_short', strain: true, text: `Short sleep ${sleep.shortNights} of the last ${sleep.nightsWithData} nights${last}` });
    } else if (sleep.lastNight != null && sleep.shortNights === 0) {
      factors.push({ kind: 'sleep_ok', strain: false, text: `Slept ${h(sleep.lastNight)}` });
    }
  }
  if (input.load.status === 'spike') {
    factors.push({ kind: 'load_spike', strain: true, text: `Training load this week is ${input.load.ratio}× your recent average` });
  } else if (input.load.status === 'drop') {
    factors.push({ kind: 'load_drop', strain: false, text: 'Training load is well below your recent average' });
  }
  if (check?.soreness != null && check.soreness >= 4) factors.push({ kind: 'soreness_high', strain: true, text: 'Feeling sore today' });
  if (check?.energy != null && check.energy <= 2) factors.push({ kind: 'energy_low', strain: true, text: 'Energy is low today' });
  if (check?.stress != null && check.stress >= 4) factors.push({ kind: 'stress_high', strain: true, text: 'Stress is high today' });
  if (input.fuel === 'low') factors.push({ kind: 'fuel_low', strain: true, text: 'Eating well under your target the last few days' });
  if (check?.cyclePhase) factors.push({ kind: 'cycle_phase', strain: false, text: `Cycle: ${CYCLE_PHASE_LABEL[check.cyclePhase].toLowerCase()} phase` });
  if (check?.note?.trim()) factors.push({ kind: 'note', strain: false, text: `“${check.note.trim()}”` });

  const strain = factors.filter((f) => f.strain).length;
  const tone: ReadTone = strain >= 2 ? 'ease' : strain === 1 ? 'watch' : 'steady';
  const first = factors.find((f) => f.strain);
  const headline =
    tone === 'ease'
      ? 'Today looks like an easier day'
      : tone === 'watch'
        ? `Train as planned, and keep an eye on it: ${first!.text.charAt(0).toLowerCase()}${first!.text.slice(1)}`
        : check || sleep.nightsWithData
          ? 'Good to train as planned'
          : 'No check-in yet today';
  return { date: today, tone, headline, factors, suggestLighter: tone === 'ease' };
}

/** What the coach sees: nothing if the athlete turned sharing off; the cycle phase only if they chose to share it. */
export function sharedRead(read: DailyRead, check: DailyCheck | null): DailyRead | null {
  if (check && !check.shareWithCoach) return null;
  const factors = read.factors.filter((f) => f.kind !== 'cycle_phase' || !!check?.shareCycle);
  return { ...read, factors };
}

/* ---------- the lighter option (coach-approved) ---------- */

export const LighterRule = z.object({
  /** Reduce prescribed loads by this percentage (0–30). */
  loadPct: z.number().int().min(0).max(30),
  /** Drop this many sets from each exercise, never below one set. */
  dropSets: z.number().int().min(0).max(3),
});
export type LighterRule = z.infer<typeof LighterRule>;
export const DEFAULT_LIGHTER: LighterRule = { loadPct: 10, dropSets: 1 };

export function describeLighter(r: LighterRule): string {
  const parts = [r.loadPct ? `${r.loadPct}% lighter loads` : null, r.dropSets ? `${r.dropSets} fewer set${r.dropSets === 1 ? '' : 's'} per exercise` : null].filter(Boolean);
  return parts.length ? parts.join(', ') : 'Same session';
}

/** Applies the lighter rule to a session's exercises (any shape with sets and an optional loadKg). */
export function applyLighter<E extends { sets: { loadKg: number | null }[] }>(exercises: E[], r: LighterRule, incrementKg = 2.5): E[] {
  return exercises.map((e) => {
    const keep = Math.max(1, e.sets.length - r.dropSets);
    return {
      ...e,
      sets: e.sets.slice(0, keep).map((s) => ({
        ...s,
        loadKg: s.loadKg == null ? null : Math.max(0, Math.round((s.loadKg * (1 - r.loadPct / 100)) / incrementKg) * incrementKg),
      })),
    };
  });
}

/* ---------- clients who could use a check-in ---------- */

export interface MemberSignals {
  /** Sessions done vs planned in each of the last 4 weeks, oldest first. */
  weeks: { planned: number; done: number }[];
  daysSinceLastOpen: number | null;
  daysSinceLastSession: number | null;
  /** "Ease" reads in the last 14 days vs the 14 before. */
  easeReadsRecent: number;
  easeReadsBefore: number;
  checkInsMissed: number;
  paymentIssue: boolean;
  tenureDays: number;
}

export type RiskLevel = 'high' | 'medium' | 'low';
export interface MemberRisk {
  level: RiskLevel;
  points: number;
  reasons: string[];
}

/**
 * Transparent points, no black box: each signal adds points and a plain reason the coach can read.
 * ≥ 5 high, 3–4 medium. Thresholds are in this function and covered by tests.
 */
export function memberRisk(s: MemberSignals): MemberRisk {
  const reasons: string[] = [];
  let points = 0;
  const rate = (w?: { planned: number; done: number }) => (w && w.planned > 0 ? w.done / w.planned : null);
  const early = [rate(s.weeks[0]), rate(s.weeks[1])].filter((x): x is number => x != null);
  const late = [rate(s.weeks[2]), rate(s.weeks[3])].filter((x): x is number => x != null);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  if (early.length && late.length && avg(early) >= 0.5 && avg(late) <= avg(early) / 2) {
    points += 3;
    reasons.push(`Sessions fell from ${Math.round(avg(early) * 100)}% to ${Math.round(avg(late) * 100)}% of plan`);
  }
  if (s.daysSinceLastSession != null && s.daysSinceLastSession >= 10) {
    points += 2;
    reasons.push(`No session in ${s.daysSinceLastSession} days`);
  }
  if (s.daysSinceLastOpen != null && s.daysSinceLastOpen >= 7) {
    points += 2;
    reasons.push(`Hasn’t opened the app in ${s.daysSinceLastOpen} days`);
  }
  if (s.easeReadsRecent >= 4 && s.easeReadsRecent >= s.easeReadsBefore * 2) {
    points += 1;
    reasons.push(`Rough recovery: ${s.easeReadsRecent} easy-day reads in two weeks`);
  }
  if (s.checkInsMissed >= 2) {
    points += 1;
    reasons.push(`Missed ${s.checkInsMissed} weekly check-ins`);
  }
  if (s.paymentIssue) {
    points += 2;
    reasons.push('Payment failed');
  }
  if (s.tenureDays < 60 && points > 0) {
    points += 1;
    reasons.push('In their first two months');
  }
  const level: RiskLevel = points >= 5 ? 'high' : points >= 3 ? 'medium' : 'low';
  return { level, points, reasons };
}

/** Yearly revenue at stake for a client: their monthly value × 12. Shown with the assumption spelled out. */
export const yearlyValueCents = (monthlyCents: number) => monthlyCents * 12;

export const KEPT_AFTER_DAYS = 60;
export type InterventionOutcome = 'kept' | 'left' | 'pending';

/** A client counts as kept when still active 60 days after the coach stepped in. */
export function interventionOutcome(intervenedOn: string, stillActive: boolean, leftOn: string | null, today: string): InterventionOutcome {
  if (!stillActive || leftOn) return 'left';
  return dayNum(today) - dayNum(intervenedOn) >= KEPT_AFTER_DAYS ? 'kept' : 'pending';
}
