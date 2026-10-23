import type { HealthPeriod, ImportedWorkout, WearableDay } from './physiology';

/**
 * Wearable signals (docs/features/brief.md): HRV and resting heart rate against the athlete's OWN
 * recent baseline, never a population norm. Apple Health reports HRV as SDNN and Health Connect as
 * RMSSD; they aren't comparable, so a reading is only ever compared with earlier readings from the
 * same source.
 *
 * Rules (one each, kept deliberately simple so they can be explained in a sentence):
 * - Baseline: the prior 28 days (not today) from the same source, needing at least 7 readings.
 * - HRV is "low" when today's reading is more than 1 standard deviation under the baseline mean.
 * - Resting HR is "high" when today's reading is 5 bpm or more over the baseline mean.
 */

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const isoOf = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

export const BASELINE_DAYS = 28;
export const BASELINE_MIN_READINGS = 7;
export const RESTING_HR_HIGH_BPM = 5;

export type BaselineLevel = 'low' | 'high' | 'normal' | 'unknown';

export interface BaselineStatus {
  status: BaselineLevel;
  today: number | null;
  /** Mean of the prior 28 days from the same source, when there are ≥ 7 readings. */
  baseline: number | null;
  sd: number | null;
  /** Today against the baseline, rounded: −18 means 18% under. */
  deltaPct: number | null;
  /** Today minus the baseline, in the metric's own unit (ms or bpm), rounded to 1 decimal. */
  delta: number | null;
  readings: number;
  source: WearableDay['source'] | null;
}

export const WEARABLE_SOURCE_LABEL: Record<WearableDay['source'], string> = {
  apple_health: 'Apple Watch',
  health_connect: 'Health Connect',
  manual: 'entered by you',
};

const SOURCE_ORDER: WearableDay['source'][] = ['apple_health', 'health_connect', 'manual'];

function statusFor(days: WearableDay[], today: string, pick: (d: WearableDay) => number | null): Omit<BaselineStatus, 'status'> {
  const t = dayNum(today);
  const todays = days
    .filter((d) => d.date === today && pick(d) != null)
    .sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source))[0];
  if (!todays) return { today: null, baseline: null, sd: null, deltaPct: null, delta: null, readings: 0, source: null };
  const value = pick(todays)!;
  const prior = days
    .filter((d) => d.source === todays.source && pick(d) != null)
    .filter((d) => {
      const ago = t - dayNum(d.date);
      return ago >= 1 && ago <= BASELINE_DAYS;
    })
    .map(pick) as number[];
  if (prior.length < BASELINE_MIN_READINGS) {
    return { today: value, baseline: null, sd: null, deltaPct: null, delta: null, readings: prior.length, source: todays.source };
  }
  const mean = prior.reduce((a, b) => a + b, 0) / prior.length;
  const sd = Math.sqrt(prior.reduce((a, b) => a + (b - mean) ** 2, 0) / prior.length);
  return {
    today: value,
    baseline: Math.round(mean * 10) / 10,
    sd: Math.round(sd * 10) / 10,
    deltaPct: mean > 0 ? Math.round(((value - mean) / mean) * 100) : null,
    delta: Math.round((value - mean) * 10) / 10,
    readings: prior.length,
    source: todays.source,
  };
}

/** HRV today vs the athlete's own 28-day baseline (same source only). Low = more than 1 SD under the mean. */
export function hrvStatus(days: WearableDay[], today: string): BaselineStatus {
  const s = statusFor(days, today, (d) => d.hrvMs);
  if (s.baseline == null || s.sd == null || s.today == null) return { ...s, status: 'unknown' };
  return { ...s, status: s.today < s.baseline - s.sd ? 'low' : 'normal' };
}

/** Resting heart rate today vs the athlete's own 28-day baseline. High = 5 bpm or more over the mean. */
export function restingHrStatus(days: WearableDay[], today: string): BaselineStatus {
  const s = statusFor(days, today, (d) => d.restingHr);
  if (s.baseline == null || s.today == null) return { ...s, status: 'unknown' };
  return { ...s, status: s.today - s.baseline >= RESTING_HR_HIGH_BPM ? 'high' : 'normal' };
}

/* ---------- imported workouts ---------- */

export interface ImportedLoad {
  load: number;
  rpe: number;
  /** Always true: an RPE guessed from heart rate, or the default 6. Labelled as an estimate in the UI. */
  estimated: true;
  basis: 'heart_rate' | 'default';
}

export const IMPORTED_DEFAULT_RPE = 6;

/**
 * Session load (minutes × RPE, the same units as signals.ts sessionLoad) for a workout from the health
 * app. The RPE is estimated from average heart rate as a share of the highest heart rate the athlete
 * has been seen to reach (their own max, never "220 − age"); without heart rate it's 6.
 */
export function importedWorkoutLoad(w: Pick<ImportedWorkout, 'durationMin' | 'avgHr'>, maxObservedHr: number | null): ImportedLoad {
  const minutes = Math.max(0, Math.round(w.durationMin));
  if (w.avgHr == null || !maxObservedHr || maxObservedHr <= 0) {
    return { load: minutes * IMPORTED_DEFAULT_RPE, rpe: IMPORTED_DEFAULT_RPE, estimated: true, basis: 'default' };
  }
  const pct = w.avgHr / maxObservedHr;
  const rpe = pct < 0.6 ? 3 : pct < 0.7 ? 4 : pct < 0.78 ? 5 : pct < 0.84 ? 6 : pct < 0.88 ? 7 : pct < 0.92 ? 8 : 9;
  return { load: minutes * rpe, rpe, estimated: true, basis: 'heart_rate' };
}

/** The highest heart rate seen across imported workouts (their own max), or null. */
export function maxObservedHr(workouts: Pick<ImportedWorkout, 'maxHr' | 'avgHr'>[]): number | null {
  const all = workouts.flatMap((w) => [w.maxHr, w.avgHr]).filter((x): x is number => x != null && x > 0);
  return all.length ? Math.max(...all) : null;
}

export interface SpotterSessionSpan {
  sessionId: string;
  startedAt: string;
  finishedAt: string;
}

export interface DedupedWorkouts {
  /** Workouts that are their own sessions (not already logged in Spotter). */
  separate: ImportedWorkout[];
  /** Spotter session id → the matching health-app workout's heart rate and kcal. Spotter's log wins. */
  attached: Record<string, Pick<ImportedWorkout, 'id' | 'avgHr' | 'maxHr' | 'activeKcal'>>;
}

/**
 * A workout that overlaps a Spotter session for more than half of its own time is the same session
 * (for example the Apple Watch "Traditional Strength Training" workout started alongside Spotter).
 * Spotter's session wins; the workout's heart rate and kcal are attached to it.
 */
export function dedupeImported(workouts: ImportedWorkout[], sessions: SpotterSessionSpan[]): DedupedWorkouts {
  const separate: ImportedWorkout[] = [];
  const attached: DedupedWorkouts['attached'] = {};
  for (const w of workouts) {
    const ws = Date.parse(w.startedAt);
    const we = ws + w.durationMin * 60_000;
    const len = Math.max(1, we - ws);
    const match = sessions.find((s) => {
      const overlap = Math.min(we, Date.parse(s.finishedAt)) - Math.max(ws, Date.parse(s.startedAt));
      return overlap / len > 0.5;
    });
    if (match) attached[match.sessionId] = { id: w.id, avgHr: w.avgHr, maxHr: w.maxHr, activeKcal: w.activeKcal };
    else separate.push(w);
  }
  return { separate, attached };
}

/* ---------- periods from the health app ---------- */

/**
 * Groups menstrual-flow days into periods: consecutive days (a one-day gap is allowed, since flow is
 * often not logged every day) form one period. Dates are YYYY-MM-DD; duplicates are fine.
 */
export function groupFlowDays(dates: string[]): HealthPeriod[] {
  const days = [...new Set(dates)].map(dayNum).sort((a, b) => a - b);
  const out: HealthPeriod[] = [];
  let start: number | null = null;
  let last: number | null = null;
  for (const d of days) {
    if (start == null || last == null || d - last > 2) {
      if (start != null && last != null) out.push({ start: isoOf(start), end: isoOf(last) });
      start = d;
    }
    last = d;
  }
  if (start != null && last != null) out.push({ start: isoOf(start), end: isoOf(last) });
  return out;
}
