import { z } from 'zod';
import { isoDate } from './schemas';
import { CYCLE_PHASE_LABEL, type CyclePhase } from './signals';
import { SYMPTOMS, type Confidence, type CycleEstimate, type CycleMode, type CycleProfile, type PeriodLog, type Symptom } from './physiology';

/**
 * Cycle estimate (docs/features/cycle.md). Everything is built from the athlete's own logged periods:
 * their typical length is the median of their recent cycles, never a textbook 28 days. The output says
 * how sure it is and why, and modes without phases (hormonal contraception, post-menopause, pregnancy
 * or postpartum, not tracking) get an honest note instead of a guess.
 */

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const isoOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

/** Cycles outside this range aren't counted in the typical length (reported as irregularities instead). */
export const CYCLE_MIN_DAYS = 15;
export const CYCLE_MAX_DAYS = 60;
/** How many recent complete cycles the typical length uses. */
export const CYCLE_WINDOW = 6;
/** The luteal half is the steadier one, so phases count back from the next period. */
export const LUTEAL_DAYS = 13;
export const OVULATION_DAYS = 3;
export const DEFAULT_PERIOD_DAYS = 5;
/** Natural mode: a cycle this long, or no period for this many days, is worth noting (neutrally). */
export const LONG_CYCLE_DAYS = 35;
export const NO_PERIOD_DAYS = 90;
/** A cycle that differs from the typical length by more than this is noted. */
export const CHANGE_DAYS = 7;

const PHASED_MODES: CycleMode[] = ['natural', 'irregular', 'perimenopause'];
/** Modes where a phase is only shown once the estimate is at least medium confidence. */
const CAUTIOUS_MODES: CycleMode[] = ['irregular', 'perimenopause'];

export const CONFIDENCE_RANK: Record<Confidence, number> = { none: 0, low: 1, medium: 2, high: 3 };
export const CONFIDENCE_WORDS: Record<Confidence, string> = {
  none: 'Not enough data yet',
  low: 'Rough estimate',
  medium: 'Fairly sure',
  high: 'Sure',
};

/** Lower-case phase words for sentences ("the luteal phase", "your period"). */
export const PHASE_WORDS: Record<CyclePhase, string> = {
  menstrual: 'period',
  follicular: 'follicular phase',
  ovulation: 'ovulation window',
  luteal: 'luteal phase',
};

/** Short notes for modes without phases. */
export const MODE_NOTE: Partial<Record<CycleMode, string>> = {
  hormonal: 'On hormonal contraception, the app uses your own day-to-day data instead of cycle phases.',
  postmenopause: 'Post-menopause has no cycle phases. The app uses your own day-to-day data and any symptoms you log.',
  pregnant_postpartum: 'Pregnant or postpartum: no cycle phases, and cycle-based load changes are paused.',
  not_tracking: 'Cycle tracking is off. Nothing about your cycle is used.',
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Sorted by start, one entry per start date (the later entry wins). */
export function sortedPeriods(periods: PeriodLog[]): PeriodLog[] {
  const byStart = new Map<string, PeriodLog>();
  for (const p of periods) byStart.set(p.start, p);
  return [...byStart.values()].sort((a, b) => a.start.localeCompare(b.start));
}

export interface CycleStats {
  /** Lengths of every complete cycle between logged starts, oldest first. */
  lengths: { start: string; days: number }[];
  /** The recent in-range cycles the typical length uses. */
  recent: number[];
  typicalLength: number | null;
  /** Longest minus shortest of the recent cycles. */
  spread: number | null;
  confidence: Confidence;
}

/** Typical length = median of the last up-to-6 complete cycles between 15 and 60 days. */
export function cycleStats(periods: PeriodLog[]): CycleStats {
  const ps = sortedPeriods(periods);
  const lengths = ps.slice(1).map((p, i) => ({ start: ps[i]!.start, days: dayNum(p.start) - dayNum(ps[i]!.start) }));
  const recent = lengths
    .map((l) => l.days)
    .filter((d) => d >= CYCLE_MIN_DAYS && d <= CYCLE_MAX_DAYS)
    .slice(-CYCLE_WINDOW);
  if (recent.length === 0) return { lengths, recent, typicalLength: null, spread: null, confidence: 'none' };
  const spread = Math.max(...recent) - Math.min(...recent);
  const n = recent.length;
  const confidence: Confidence = n <= 2 || spread > 7 ? 'low' : n >= 6 && spread <= 4 ? 'high' : 'medium';
  return { lengths, recent, typicalLength: Math.round(median(recent)), spread, confidence };
}

/** Days of bleeding for a logged period: the logged end, else 5. */
const periodDays = (p: PeriodLog) => (p.end ? Math.max(1, dayNum(p.end) - dayNum(p.start) + 1) : DEFAULT_PERIOD_DAYS);

/** Phase for a day of the cycle, given the cycle's length (counting back from the next start). */
export function phaseForDay(day: number, cycleLength: number, bleedDays: number): CyclePhase {
  if (day <= bleedDays) return 'menstrual';
  const lutealFrom = cycleLength - LUTEAL_DAYS + 1;
  if (day >= lutealFrom) return 'luteal';
  if (day >= lutealFrom - OVULATION_DAYS) return 'ovulation';
  return 'follicular';
}

function irregularities(profile: CycleProfile, date: string, stats: CycleStats): string[] {
  if (!PHASED_MODES.includes(profile.mode)) return [];
  const t = dayNum(date);
  const out: string[] = [];
  const recentLengths = stats.lengths.filter((l) => t - dayNum(l.start) <= 365);
  for (const l of recentLengths) {
    if (l.days < CYCLE_MIN_DAYS || l.days > CYCLE_MAX_DAYS) {
      out.push(`A ${l.days}-day cycle (from ${l.start}) isn’t counted in your typical length`);
    } else if (profile.mode === 'natural' && l.days > LONG_CYCLE_DAYS) {
      out.push(`A cycle ran ${l.days} days (from ${l.start})`);
    }
  }
  if (profile.mode === 'natural') {
    // The latest cycle against the typical length of the ones before it.
    const last = stats.lengths[stats.lengths.length - 1];
    const before = cycleStats(sortedPeriods(profile.periods).slice(0, -1));
    if (last && before.typicalLength != null && before.recent.length >= 2 && last.days <= LONG_CYCLE_DAYS && last.days >= CYCLE_MIN_DAYS) {
      const diff = last.days - before.typicalLength;
      if (Math.abs(diff) > CHANGE_DAYS) {
        out.push(`Your last cycle ran ${last.days} days, ${Math.abs(diff)} ${diff > 0 ? 'more' : 'fewer'} than your usual ${before.typicalLength}`);
      }
    }
    const lastStart = sortedPeriods(profile.periods).filter((p) => p.start <= date).pop();
    if (lastStart && t - dayNum(lastStart.start) >= NO_PERIOD_DAYS) out.push(`No period logged for ${t - dayNum(lastStart.start)} days`);
  }
  return out;
}

/**
 * The cycle estimate for a date. Day 1 is the first day of the last period on or before the date.
 * Looking back, when the next period is already logged, phases use that real cycle's length.
 */
export function estimateCycle(profile: CycleProfile, date: string): CycleEstimate {
  const base = { date, mode: profile.mode };
  const modeNote = MODE_NOTE[profile.mode];
  if (modeNote) {
    return { ...base, phase: null, dayOfCycle: null, typicalLength: null, confidence: 'none', nextPeriod: null, note: modeNote, irregularities: [] };
  }
  const ps = sortedPeriods(profile.periods);
  const stats = cycleStats(ps);
  const irr = irregularities(profile, date, stats);
  const t = dayNum(date);
  let lastIdx = -1;
  ps.forEach((p, i) => {
    if (p.start <= date) lastIdx = i;
  });
  const last = lastIdx >= 0 ? ps[lastIdx]! : null;
  if (!last) {
    return {
      ...base,
      phase: null,
      dayOfCycle: null,
      typicalLength: stats.typicalLength,
      confidence: 'none',
      nextPeriod: null,
      note: 'Log the first day of your period to start estimating your phase.',
      irregularities: irr,
    };
  }
  const day = t - dayNum(last.start) + 1;
  const bleed = periodDays(last);
  const next = ps[lastIdx + 1];
  const typical = stats.typicalLength;
  const cycleLength = next ? dayNum(next.start) - dayNum(last.start) : typical;
  const based = `based on your last ${stats.recent.length} cycle${stats.recent.length === 1 ? '' : 's'}`;
  const cautious = CAUTIOUS_MODES.includes(profile.mode);

  // Next-period window: the typical length ± half the spread, at least ± 2 days.
  let nextPeriod: CycleEstimate['nextPeriod'] = null;
  if (typical != null && !next && (!cautious || CONFIDENCE_RANK[stats.confidence] >= CONFIDENCE_RANK.medium)) {
    const half = Math.max(2, Math.ceil((stats.spread ?? 0) / 2));
    const mid = dayNum(last.start) + typical;
    if (t <= mid + half) nextPeriod = { from: isoOf(Math.max(mid - half, t)), to: isoOf(mid + half) };
  }

  const result = (phase: CyclePhase | null, note: string, confidence: Confidence = stats.confidence): CycleEstimate => ({
    ...base,
    phase,
    dayOfCycle: day,
    typicalLength: typical,
    confidence,
    nextPeriod,
    note,
    irregularities: irr,
  });

  // Bleeding days are what the athlete logged, so they don't depend on the estimate.
  if (day <= bleed) {
    return result('menstrual', `Day ${day}: your period`, cautious && CONFIDENCE_RANK[stats.confidence] < 2 ? 'low' : stats.confidence);
  }
  if (cycleLength == null) {
    return result(null, `Day ${day} since your last period. Log one more period start and the app can estimate your phases.`, 'none');
  }
  if (cautious && CONFIDENCE_RANK[stats.confidence] < CONFIDENCE_RANK.medium) {
    return result(
      null,
      `Day ${day} since your last period. Your cycles vary too much right now to estimate a phase, so the app uses your own day-to-day data instead.`,
    );
  }
  if (!next && day > cycleLength + CHANGE_DAYS) {
    return result(null, `Day ${day} since your last period, later than your usual ${cycleLength}. The app won’t guess a phase until you log the next one.`, 'low');
  }
  const phase = phaseForDay(day, Math.max(cycleLength, day), bleed);
  const len = next ? `${cycleLength}` : `about ${cycleLength}`;
  return result(phase, `Day ${day} of ${len}, ${PHASE_WORDS[phase]} (estimated, ${based})`);
}

/** "Luteal phase, day 22 (estimated)" for read-only lines. */
export function phaseLine(e: CycleEstimate): string | null {
  if (!e.phase || e.dayOfCycle == null) return null;
  const name = e.phase === 'menstrual' ? 'Period' : `${CYCLE_PHASE_LABEL[e.phase]} ${e.phase === 'ovulation' ? 'window' : 'phase'}`;
  return `${name}, day ${e.dayOfCycle} (estimated)`;
}

/** Memoised phaseOn for calibration, built from the same period logs. */
export function phaseOnFor(profile: CycleProfile): (date: string) => CycleEstimate {
  const cache = new Map<string, CycleEstimate>();
  return (date) => {
    let e = cache.get(date);
    if (!e) cache.set(date, (e = estimateCycle(profile, date)));
    return e;
  };
}

/* ---------- periods from Apple Health / Health Connect ---------- */

/** Starts within this many days are treated as the same period. */
export const MERGE_WINDOW_DAYS = 3;

/**
 * Merges periods read from the health app with the ones the athlete typed in, so nothing is entered
 * twice. The athlete's own entry always wins over an imported one within 3 days of it.
 */
export function mergePeriods(logged: PeriodLog[], imported: { start: string; end: string | null }[]): PeriodLog[] {
  const out: PeriodLog[] = [...logged];
  const near = (a: string, b: string) => Math.abs(dayNum(a) - dayNum(b)) <= MERGE_WINDOW_DAYS;
  for (const p of [...imported].sort((a, b) => a.start.localeCompare(b.start))) {
    if (out.some((q) => near(q.start, p.start))) continue;
    out.push({ start: p.start, end: p.end, source: 'health' });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/* ---------- symptoms ---------- */

export const SYMPTOM_LABEL: Record<Symptom, string> = {
  hot_flashes: 'Hot flushes',
  night_sweats: 'Night sweats',
  poor_sleep: 'Poor sleep',
  joint_aches: 'Joint aches',
  low_mood: 'Low mood',
  brain_fog: 'Brain fog',
  cramps: 'Cramps',
  bloating: 'Bloating',
  headache: 'Headache',
};
export const SYMPTOM_LEVEL_LABEL = ['None', 'Mild', 'Moderate', 'Severe'] as const;

/** One day's symptoms, 0 none … 3 severe. Private to the athlete; never sent to the coach. */
export const SymptomLog = z.object({
  date: isoDate,
  scores: z.partialRecord(z.enum(SYMPTOMS), z.number().int().min(0).max(3)),
});
export type SymptomLog = z.infer<typeof SymptomLog>;
