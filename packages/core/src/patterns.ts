import { PHASE_WORDS } from './cycle';
import { SHORT_SLEEP_HOURS } from './signals';
import { MUSCLE_GROUP_WORDS, mainMuscleGroup, type ClientDay, type MuscleGroup, type TimelineScore, type TimelineSession } from './timeline';
import { efficiencyFactor } from './endurance';
import type { Calibration } from './physiology';

/**
 * "What works for {client}" (docs/features/patterns.md): a personal pattern finder over the client's own
 * daily history (timeline.ts ClientDay[], typically 8+ weeks). Each detector compares two groups of the
 * client's own days or sessions and only speaks when the data supports it.
 *
 * The statistics rule (one rule for every detector, so it can be explained in a sentence):
 * - Each group needs at least MIN_GROUP_N (6) values, unless a detector says otherwise.
 * - The difference of the two means is divided by its Welch standard error, sqrt(varA/nA + varB/nB),
 *   with sample variances. That ratio (z) sets the confidence: ≥ 2 high, ≥ 1.5 medium, below 1.5 the
 *   pattern isn't shown at all. Analytic, so the same history always gives the same answer.
 * - Each detector also has a smallest difference worth mentioning (e.g. 1% on lifts), so a tiny but
 *   steady difference isn't presented as something to act on.
 *
 * These are associations in one person's history, never proof of cause: titles say "tend to", and
 * suggestions are things to try and watch, not rules.
 */

export const MIN_GROUP_N = 6;
export const Z_HIGH = 2;
export const Z_MEDIUM = 1.5;

export type PatternConfidence = 'low' | 'medium' | 'high';
const RANK: Record<PatternConfidence, number> = { low: 0, medium: 1, high: 2 };

export interface Comparison {
  meanA: number;
  meanB: number;
  /** meanA − meanB */
  diff: number;
  se: number;
  /** |diff| ÷ se (Infinity when both groups have no spread and differ). */
  z: number;
  nA: number;
  nB: number;
  /** Null when z is under Z_MEDIUM: not shown. */
  confidence: 'medium' | 'high' | null;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const variance = (xs: number[]) => {
  const m = mean(xs);
  return xs.length > 1 ? xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1) : 0;
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);

/** Welch-style comparison of two group means. Null when either group is under `minN`. */
export function compareMeans(a: number[], b: number[], minN = MIN_GROUP_N): Comparison | null {
  if (a.length < minN || b.length < minN) return null;
  const meanA = mean(a);
  const meanB = mean(b);
  const diff = meanA - meanB;
  const se = Math.sqrt(variance(a) / a.length + variance(b) / b.length);
  const z = se === 0 ? (diff === 0 ? 0 : Infinity) : Math.abs(diff) / se;
  const confidence = z >= Z_HIGH ? 'high' : z >= Z_MEDIUM ? 'medium' : null;
  return { meanA, meanB, diff, se, z, nA: a.length, nB: b.length, confidence };
}

export type PatternKind =
  | 'recovery_time'
  | 'sleep_performance'
  | 'sleep_rpe'
  | 'fuel_performance'
  | 'volume_response'
  | 'mobility_soreness'
  | 'time_of_day'
  | 'cycle_phase'
  | 'conditioning_sleep'
  | 'conditioning_trend'
  | 'aerobic_efficiency'
  | 'compromised_running';

export interface Pattern {
  id: string;
  kind: PatternKind;
  /** Plain English, short, with the number: "Lifts tend to run 5% lower after short nights". */
  title: string;
  /** What was compared: "14 sessions after short nights vs 31 after normal ones". */
  detail: string;
  effect: { value: number; unit: string };
  /** Group sizes: a = the condition in the title, b = what it was compared with. */
  n: { a: number; b: number };
  confidence: PatternConfidence;
  /** Something the coach could try (and watch), never a rule. */
  suggestion: string;
  domains: string[];
}

/** A coach's pinned note in the client's playbook: from a pattern, or written by the coach. For later UI. */
export interface PlaybookEntry {
  id: string;
  patternId: string | null;
  text: string;
  pinnedAt: string;
  source: 'pattern' | 'coach';
}

export function pinPattern(p: Pattern, id: string, now: string): PlaybookEntry {
  return { id, patternId: p.id, text: p.suggestion, pinnedAt: now, source: 'pattern' };
}

/* ---------- shared helpers ---------- */

interface SessionAt {
  i: number;
  day: ClientDay;
  s: TimelineSession;
}

const spotterSessions = (days: ClientDay[]): SessionAt[] =>
  days.flatMap((day, i) => day.training.sessions.filter((s) => s.source === 'spotter').map((s) => ({ i, day, s })));

/**
 * Short night (signals.ts rule): under 6.5 h, or more than an hour under the client's own average of the
 * 14 nights before (needs 5+). Null when the night wasn't recorded.
 */
export function shortNight(days: ClientDay[], i: number): boolean | null {
  const h = days[i]?.recovery.sleepHours;
  if (h == null) return null;
  const prior = days
    .slice(Math.max(0, i - 14), i)
    .map((d) => d.recovery.sleepHours)
    .filter((x): x is number => x != null);
  const base = prior.length >= 5 ? mean(prior) : null;
  return h < SHORT_SLEEP_HOURS || (base != null && h < base - 1);
}

const pct = (n: number) => `${Math.abs(Math.round(n))}%`;
const plural = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const confidenceOf = (c: Comparison): PatternConfidence => c.confidence ?? 'low';

/* ---------- detectors ---------- */

/** Days counted after a session before HRV is back within the baseline (not low). Capped at 6 = "6 or more". */
export const RECOVERY_CAP_DAYS = 6;

function daysToBaseline(days: ClientDay[], i: number): number | null {
  let seen = false;
  for (let k = 1; k < RECOVERY_CAP_DAYS; k++) {
    const d = days[i + k];
    if (!d) return null; // history ends before HRV is back: unknown
    if (d.recovery.hrvLow == null) continue;
    seen = true;
    if (!d.recovery.hrvLow) return k;
  }
  return seen ? RECOVERY_CAP_DAYS : null;
}

/**
 * recovery_time: after the client's heavy sessions (training days in the top quarter of their own day
 * loads), how many days until HRV is back within the baseline, against their other training days.
 */
export function recoveryTime(days: ClientDay[]): Pattern | null {
  const training = days.map((d, i) => ({ d, i })).filter(({ d }) => d.training.load > 0);
  if (training.length < 12) return null;
  const loads = training.map(({ d }) => d.training.load).sort((a, b) => a - b);
  const q75 = loads[Math.floor(loads.length * 0.75)]!;
  const hard: number[] = [];
  const other: number[] = [];
  for (const { d, i } of training) {
    const k = daysToBaseline(days, i);
    if (k == null) continue;
    (d.training.load >= q75 ? hard : other).push(k);
  }
  const c = compareMeans(hard, other);
  if (!c?.confidence || c.diff < 0.5) return null;
  const typical = Math.round(median(hard));
  const usual = Math.round(median(other));
  const dayWord = (n: number) => (n >= RECOVERY_CAP_DAYS ? `${n}+ days` : plural(n, 'day'));
  return {
    id: 'recovery_time',
    kind: 'recovery_time',
    title: `HRV takes about ${dayWord(typical)} to recover after heavy sessions`,
    detail: `${hard.length} heavy sessions (top quarter of load) vs ${other.length} others: back to usual in ${dayWord(typical)} vs ${dayWord(usual)}`,
    effect: { value: r1(c.diff), unit: 'days' },
    n: { a: hard.length, b: other.length },
    confidence: confidenceOf(c),
    suggestion: `Leave ${typical} days between heavy sessions, or follow a heavy one with an easy day.`,
    domains: ['training', 'recovery'],
  };
}

function afterShortNights(days: ClientDay[], pick: (s: TimelineSession) => number | null | undefined) {
  const short: number[] = [];
  const normal: number[] = [];
  for (const { i, s } of spotterSessions(days)) {
    const v = pick(s);
    const sn = shortNight(days, i);
    if (v == null || sn == null) continue;
    (sn ? short : normal).push(v);
  }
  return { short, normal, c: compareMeans(short, normal) };
}

/** sleep_performance: lifts against the client's own baseline after short nights vs normal ones. */
export function sleepPerformance(days: ClientDay[]): Pattern | null {
  const { c } = afterShortNights(days, (s) => s.deltaPct);
  if (!c?.confidence || Math.abs(c.diff) < 1) return null;
  const dir = c.diff < 0 ? 'lower' : 'higher';
  return {
    id: 'sleep_performance',
    kind: 'sleep_performance',
    title: `Lifts tend to run ${pct(c.diff)} ${dir} after short nights`,
    detail: `${plural(c.nA, 'session')} after short nights (under ${SHORT_SLEEP_HOURS} h, or an hour under usual) vs ${c.nB} after normal nights`,
    effect: { value: r1(c.diff), unit: '%' },
    n: { a: c.nA, b: c.nB },
    confidence: confidenceOf(c),
    suggestion: c.diff < 0 ? 'After a short night, offer the lighter version or move the heavy day.' : 'Short nights don’t seem to cost this client strength; no change needed.',
    domains: ['sleep', 'training'],
  };
}

/** sleep_rpe: how hard sessions feel (RPE) after short nights vs normal ones. */
export function sleepRpe(days: ClientDay[]): Pattern | null {
  const { c } = afterShortNights(days, (s) => s.rpe);
  if (!c?.confidence || Math.abs(c.diff) < 0.5) return null;
  const pts = r1(Math.abs(c.diff));
  return {
    id: 'sleep_rpe',
    kind: 'sleep_rpe',
    title: `Sessions feel ${pts} RPE ${c.diff > 0 ? 'harder' : 'easier'} after short nights`,
    detail: `Average effort ${r1(c.meanA)} vs ${r1(c.meanB)} out of 10: ${plural(c.nA, 'session')} after short nights vs ${c.nB} after normal nights`,
    effect: { value: r1(c.diff), unit: 'RPE' },
    n: { a: c.nA, b: c.nB },
    confidence: confidenceOf(c),
    suggestion: 'On short-sleep days, cap the top sets an RPE point lower than planned.',
    domains: ['sleep', 'training'],
  };
}

/** Fuelled day: food at 90%+ of the calorie target, or carbs at 90%+ of the carb target. */
export const FUELLED_SHARE = 0.9;

/** fuel_performance: lifts on fuelled days vs days under target. */
export function fuelPerformance(days: ClientDay[]): Pattern | null {
  const fed: number[] = [];
  const under: number[] = [];
  for (const { day, s } of spotterSessions(days)) {
    const { vsTarget, carbsVsTarget } = day.nutrition;
    if (s.deltaPct == null || (vsTarget == null && carbsVsTarget == null)) continue;
    const ok = (vsTarget ?? 0) >= FUELLED_SHARE || (carbsVsTarget ?? 0) >= FUELLED_SHARE;
    (ok ? fed : under).push(s.deltaPct);
  }
  const c = compareMeans(fed, under);
  if (!c?.confidence || Math.abs(c.diff) < 1) return null;
  return {
    id: 'fuel_performance',
    kind: 'fuel_performance',
    title: `Lifts tend to run ${pct(c.diff)} ${c.diff > 0 ? 'higher' : 'lower'} on well-fuelled days`,
    detail: `${plural(c.nA, 'session')} on days eaten to 90%+ of target vs ${c.nB} on days under it`,
    effect: { value: r1(c.diff), unit: '%' },
    n: { a: c.nA, b: c.nB },
    confidence: confidenceOf(c),
    suggestion: c.diff > 0 ? 'Check food on heavy days: a carb-and-protein meal 2–3 hours before.' : 'Eating to target doesn’t show up in this client’s lifts; keep the focus elsewhere.',
    domains: ['nutrition', 'training'],
  };
}

/** volume_response needs this many weeks of history. */
export const VOLUME_MIN_WEEKS = 12;
/** Each volume range needs at least this many weeks. */
export const VOLUME_MIN_WEEKS_PER_RANGE = 3;
const FORWARD_WEEKS = 4;

/** Solves (XᵀX) b = Xᵀy by Gaussian elimination; also returns (XᵀX)⁻¹. Null when singular. */
function leastSquares(X: number[][], y: number[]): { beta: number[]; inv: number[][] } | null {
  const k = X[0]!.length;
  const A = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => X.reduce((n, r) => n + r[i]! * r[j]!, 0)));
  const aug = A.map((row, i) => [...row, ...Array.from({ length: k }, (_, j) => (i === j ? 1 : 0)), X.reduce((n, r, m) => n + r[i]! * y[m]!, 0)]);
  for (let c = 0; c < k; c++) {
    const p = aug.reduce((best, row, r) => (r >= c && Math.abs(row[c]!) > Math.abs(aug[best]![c]!) ? r : best), c);
    if (Math.abs(aug[p]![c]!) < 1e-9) return null;
    [aug[c], aug[p]] = [aug[p]!, aug[c]!];
    const piv = aug[c]![c]!;
    aug[c] = aug[c]!.map((v) => v / piv);
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = aug[r]![c]!;
      aug[r] = aug[r]!.map((v, j) => v - f * aug[c]![j]!);
    }
  }
  return { beta: aug.map((row) => row[2 * k]!), inv: aug.map((row) => row.slice(k, 2 * k)) };
}

/**
 * volume_response: weekly hard sets (per main group when known, else total), split into the client's own
 * low / middle / high thirds, against how much the estimated max changed over the following 4 weeks.
 * Each 4-week change is read as the sum of what each of its weeks contributed at that week's volume
 * (least squares), so mixed windows still count. The best range is compared with the others' average
 * using the regression's standard error (same z rule). The windows overlap, so neighbouring changes
 * aren't independent: this detector never reports more than medium confidence.
 */
export function volumeResponse(days: ClientDay[]): Pattern | null {
  const weeks = Math.floor(days.length / 7);
  if (weeks < VOLUME_MIN_WEEKS) return null;
  const offset = days.length - weeks * 7; // blocks end on the last day
  const block = (w: number) => days.slice(offset + w * 7, offset + w * 7 + 7);
  const all = spotterSessions(days).map((x) => x.s);
  const groups: (MuscleGroup | 'total')[] = [...new Set(all.flatMap((s) => Object.keys(s.groupSets ?? {})))] as MuscleGroup[];
  if (!groups.length) groups.push('total');

  let best: Pattern | null = null;
  let bestZ = 0;
  for (const g of groups) {
    const sets: number[] = [];
    const strength: Map<string, number>[] = [];
    for (let w = 0; w < weeks; w++) {
      const ss = block(w).flatMap((d) => d.training.sessions.filter((s) => s.source === 'spotter'));
      sets.push(ss.reduce((n, s) => n + (g === 'total' ? s.hardSets : (s.groupSets?.[g] ?? 0)), 0));
      const m = new Map<string, number>();
      for (const s of ss) {
        for (const [ex, e] of Object.entries(s.bests ?? {})) {
          if (g !== 'total' && mainMuscleGroup(ex) !== g) continue;
          m.set(ex, Math.max(m.get(ex) ?? 0, e));
        }
      }
      strength.push(m);
    }
    const trained = sets.filter((x) => x > 0).sort((a, b) => a - b);
    if (trained.length < VOLUME_MIN_WEEKS || trained[trained.length - 1]! - trained[0]! < 2) continue;
    // The client's own thirds of weekly volume.
    const t1 = trained[Math.floor(trained.length / 3)]!;
    const t2 = trained[Math.floor((2 * trained.length) / 3)]!;
    const binOf = (s: number) => (s <= t1 ? 0 : s <= t2 ? 1 : 2);
    const inBin = [0, 1, 2].map((b) => trained.filter((s) => binOf(s) === b));
    if (inBin.some((b) => b.length < VOLUME_MIN_WEEKS_PER_RANGE)) continue;

    // Strength as of week w = the best of weeks w−2…w, so an off week or two (short nights, the days before
    // a period, which can fill most of two weeks) doesn't read as lost strength. Training in weeks w…w+3
    // shows up by week w+4.
    const level = (w: number) => {
      const m = new Map(strength[w]);
      for (const prev of [strength[w - 1], strength[w - 2]]) for (const [ex, v] of prev ?? []) m.set(ex, Math.max(m.get(ex) ?? 0, v));
      return m;
    };
    const X: number[][] = [];
    const y: number[] = [];
    for (let w = 2; w + FORWARD_WEEKS < weeks; w++) {
      const a = level(w);
      const b = level(w + FORWARD_WEEKS);
      const changes = [...a].filter(([ex]) => b.has(ex)).map(([ex, v]) => (b.get(ex)! / v - 1) * 100);
      const window = sets.slice(w, w + FORWARD_WEEKS);
      if (!changes.length || window.some((x) => x === 0)) continue;
      X.push([0, 1, 2].map((bin) => window.filter((s) => binOf(s) === bin).length));
      y.push(mean(changes));
    }
    if (X.length < 6) continue;
    const fit = leastSquares(X, y);
    if (!fit) continue;
    const rss = X.reduce((n, row, i) => n + (y[i]! - row.reduce((m, x, j) => m + x * fit.beta[j]!, 0)) ** 2, 0);
    const sigma2 = rss / (X.length - 3);
    const top = [0, 1, 2].reduce((a, b) => (fit.beta[b]! > fit.beta[a]! ? b : a));
    // Contrast: the best range minus the average of the other two (per week).
    const c = [0, 1, 2].map((b) => (b === top ? 1 : -0.5));
    const diff = c.reduce((n, cj, j) => n + cj * fit.beta[j]!, 0);
    const se = Math.sqrt(Math.max(0, sigma2 * c.reduce((n, ci, i) => n + ci * c.reduce((m, cj, j) => m + cj * fit.inv[i]![j]!, 0), 0)));
    const z = se === 0 ? (diff > 0 ? Infinity : 0) : diff / se;
    // Smallest difference worth mentioning: 1% over 4 weeks.
    if (z < Z_MEDIUM || diff * FORWARD_WEEKS < 1 || z <= bestZ) continue;
    const label = (b: number) => {
      const lo = Math.min(...inBin[b]!);
      const hi = Math.max(...inBin[b]!);
      return lo === hi ? `${lo}` : `${lo}–${hi}`;
    };
    const per4 = (b: number) => r1(fit.beta[b]! * FORWARD_WEEKS);
    const others = r1(((fit.beta[0]! + fit.beta[1]! + fit.beta[2]! - fit.beta[top]!) / 2) * FORWARD_WEEKS);
    const stall = top !== 2 && per4(2) <= 0.5 ? ` Above about ${Math.min(...inBin[2]!)} sets, progress stalls (${per4(2)}% per 4 weeks).` : '';
    const range = label(top);
    const who = g === 'total' ? 'Strength' : `${MUSCLE_GROUP_WORDS[g]} lifts`;
    bestZ = z;
    best = {
      id: `volume_response:${g}`,
      kind: 'volume_response',
      title: `${who} progress best at ${range} hard sets a week`,
      detail: `Estimated max up about ${per4(top)}% per 4 weeks at ${range} sets vs ${others}% at other volumes (${trained.length} weeks, ${X.length} four-week windows).${stall}`,
      effect: { value: r1(diff * FORWARD_WEEKS), unit: '% per 4 weeks' },
      n: { a: inBin[top]!.length, b: trained.length - inBin[top]!.length },
      // Overlapping windows: capped at medium.
      confidence: 'medium',
      suggestion: `Plan ${g === 'total' ? '' : `${MUSCLE_GROUP_WORDS[g].toLowerCase()} `}volume around ${range} hard sets a week${stall ? ', and treat more as a short overreach, not the default' : ''}.`,
      domains: ['training'],
    };
  }
  return best;
}

/** mobility_soreness: average soreness (daily check, 1–5) in weeks with 2+ mobility sessions vs fewer. Weeks are the unit. */
export function mobilitySoreness(days: ClientDay[]): Pattern | null {
  const weeks = Math.floor(days.length / 7);
  const offset = days.length - weeks * 7;
  const more: number[] = [];
  const fewer: number[] = [];
  for (let w = 0; w < weeks; w++) {
    const block = days.slice(offset + w * 7, offset + w * 7 + 7);
    const sore = block.map((d) => d.check?.soreness).filter((x): x is number => x != null);
    if (sore.length < 3) continue;
    const sessions = block.reduce((n, d) => n + d.mobility.sessions, 0);
    (sessions >= 2 ? more : fewer).push(mean(sore));
  }
  const c = compareMeans(more, fewer);
  if (!c?.confidence || Math.abs(c.diff) < 0.3) return null;
  const less = c.diff < 0;
  return {
    id: 'mobility_soreness',
    kind: 'mobility_soreness',
    title: `${less ? 'Less' : 'More'} sore in weeks with 2+ mobility sessions (${c.meanA.toFixed(1)} vs ${c.meanB.toFixed(1)} of 5)`,
    detail: `${plural(c.nA, 'week')} with 2 or more mobility sessions vs ${plural(c.nB, 'week')} with fewer, average daily soreness`,
    effect: { value: r1(c.diff), unit: 'points of 5' },
    n: { a: c.nA, b: c.nB },
    confidence: confidenceOf(c),
    suggestion: less ? 'Keep two short mobility sessions in the week, especially in heavy blocks.' : 'Mobility weeks aren’t less sore for this client; check what the routine includes.',
    domains: ['mobility', 'recovery'],
  };
}

/** Morning = starts before 12:00, evening = from 16:00 (the client's clock). */
export const MORNING_BEFORE = 12;
export const EVENING_FROM = 16;

/** time_of_day: morning vs evening sessions, lifts against the client's own baseline. */
export function timeOfDay(days: ClientDay[]): Pattern | null {
  const am: number[] = [];
  const pm: number[] = [];
  for (const { s } of spotterSessions(days)) {
    if (s.deltaPct == null || s.hour == null) continue;
    if (s.hour < MORNING_BEFORE) am.push(s.deltaPct);
    else if (s.hour >= EVENING_FROM) pm.push(s.deltaPct);
  }
  const c = compareMeans(am, pm);
  if (!c?.confidence || Math.abs(c.diff) < 1) return null;
  const better = c.diff > 0 ? 'morning' : 'evening';
  return {
    id: 'time_of_day',
    kind: 'time_of_day',
    title: `Lifts tend to run ${pct(c.diff)} higher in ${better} sessions`,
    detail: `${plural(c.nA, 'morning session')} (before 12:00) vs ${plural(c.nB, 'evening session')} (from 16:00)`,
    effect: { value: r1(c.diff), unit: '%' },
    n: { a: c.nA, b: c.nB },
    confidence: confidenceOf(c),
    suggestion: `When it fits the client’s week, put the heaviest session in the ${better}.`,
    domains: ['training'],
  };
}

/** cycle_phase: the calibration's own result (calibration.ts), as a pattern. Only pass a calibration the client shares. */
export function cyclePhasePattern(calibration: Calibration | null | undefined): Pattern | null {
  if (!calibration?.ready) return null;
  const a = calibration.adjustments
    .filter((x) => (x.confidence === 'medium' || x.confidence === 'high') && Math.abs(x.deltaPct) >= 1)
    // What the calibration acts on comes first, then the biggest difference.
    .sort((x, y) => Number(y.appliedPct !== 0) - Number(x.appliedPct !== 0) || Math.abs(y.deltaPct) - Math.abs(x.deltaPct))[0];
  if (!a) return null;
  return {
    id: `cycle_phase:${a.phase}`,
    kind: 'cycle_phase',
    title: `Lifts tend to run ${pct(a.deltaPct)} ${a.deltaPct < 0 ? 'lower' : 'higher'} in the ${PHASE_WORDS[a.phase]}`,
    detail: `${plural(a.sessions, 'session')} over ${plural(a.cycles, 'cycle')}, against the client’s own rolling baseline (${calibration.method})`,
    effect: { value: a.deltaPct, unit: '%' },
    n: { a: a.sessions, b: a.cycles },
    confidence: a.confidence === 'high' ? 'high' : 'medium',
    suggestion: a.appliedPct ? `Suggested loads already adjust ${Math.abs(a.appliedPct)}% in this phase; keep RPE targets as written.` : 'Keep an eye on top sets in this phase.',
    domains: ['cycle', 'training'],
  };
}

/* ---------- conditioning and aerobic domains (docs/ports.md row 7) ---------- */

/** A scored block on a day, as % better (+) or worse (−) than the client's own median for that same piece of work. */
interface RelativeScore {
  i: number;
  day: ClientDay;
  score: TimelineScore;
  rel: number;
}

/** A piece of work needs this many results before any of them is compared with its median. */
export const SCORE_MIN_REPEATS = 3;

/**
 * Every scored block with a comparable value, relative to the median of the same key (blocks.ts blockKey). For time
 * the sign is flipped, so + is always better. Capped results and unscored blocks are left out.
 */
function relativeScores(days: ClientDay[]): RelativeScore[] {
  const all = days.flatMap((day, i) =>
    day.training.sessions.flatMap((s) => (s.scores ?? []).filter((sc) => sc.value != null && sc.value > -1e6 && sc.scoring !== 'none').map((score) => ({ i, day, score }))),
  );
  const byKey = new Map<string, number[]>();
  for (const a of all) byKey.set(`${a.score.key}|${a.score.scoring}`, [...(byKey.get(`${a.score.key}|${a.score.scoring}`) ?? []), a.score.value!]);
  return all.flatMap((a) => {
    const xs = byKey.get(`${a.score.key}|${a.score.scoring}`)!;
    if (xs.length < SCORE_MIN_REPEATS) return [];
    const m = median(xs);
    return m === 0 ? [] : [{ ...a, rel: ((a.score.value! - m) / Math.abs(m)) * 100 }];
  });
}

/** Smallest conditioning difference worth mentioning, in %. */
export const CONDITIONING_MIN_PCT = 2;

/** conditioning_sleep: scored conditioning after short nights vs after normal nights. */
export function conditioningSleep(days: ClientDay[]): Pattern | null {
  const rs = relativeScores(days).filter((r) => r.score.kind !== 'intervals' && r.score.kind !== 'station_race');
  const after = (want: boolean) => rs.filter((r) => shortNight(days, r.i) === want).map((r) => r.rel);
  const c = compareMeans(after(true), after(false));
  if (!c?.confidence || Math.abs(c.diff) < CONDITIONING_MIN_PCT) return null;
  const worse = c.diff < 0;
  return {
    id: 'conditioning_sleep',
    kind: 'conditioning_sleep',
    title: `Conditioning scores tend to be ${pct(c.diff)} ${worse ? 'worse' : 'better'} after short nights`,
    detail: `${plural(c.nA, 'scored workout')} after short nights vs ${c.nB} after normal ones, each against the client’s own usual for that workout`,
    effect: { value: r1(c.diff), unit: '%' },
    n: { a: c.nA, b: c.nB },
    confidence: confidenceOf(c),
    suggestion: worse ? 'After a short night, keep the workout but drop the goal of a best score: pace it, don’t race it.' : 'Nothing to change; short nights don’t show in the scores.',
    domains: ['sleep', 'conditioning'],
  };
}

/** Weeks compared in the conditioning trend: the most recent block against the one before. */
export const TREND_BLOCK_WEEKS = 8;

/** conditioning_trend: the client's scored conditioning in the last 8 weeks against the 8 before, against their own usual. */
export function conditioningTrend(days: ClientDay[]): Pattern | null {
  const last = days.at(-1);
  if (!last) return null;
  const t = dayNum(last.date);
  const rs = relativeScores(days).filter((r) => r.score.kind !== 'intervals');
  const span = TREND_BLOCK_WEEKS * 7;
  const recent = rs.filter((r) => t - dayNum(r.day.date) < span).map((r) => r.rel);
  const before = rs.filter((r) => t - dayNum(r.day.date) >= span && t - dayNum(r.day.date) < 2 * span).map((r) => r.rel);
  const c = compareMeans(recent, before);
  if (!c?.confidence || Math.abs(c.diff) < CONDITIONING_MIN_PCT) return null;
  const up = c.diff > 0;
  return {
    id: 'conditioning_trend',
    kind: 'conditioning_trend',
    title: `Benchmarks and WODs are scoring ${pct(c.diff)} ${up ? 'better' : 'worse'} than ${TREND_BLOCK_WEEKS} weeks before`,
    detail: `${plural(c.nA, 'scored workout')} in the last ${TREND_BLOCK_WEEKS} weeks vs ${c.nB} in the ${TREND_BLOCK_WEEKS} before, each against the client’s own usual for that workout`,
    effect: { value: r1(c.diff), unit: '%' },
    n: { a: c.nA, b: c.nB },
    confidence: confidenceOf(c),
    suggestion: up ? 'Keep the current mix; retest a benchmark to show the client.' : 'Check recovery and the week’s load before the next benchmark.',
    domains: ['conditioning'],
  };
}

/** Distance reps shorter than this aren't used for pace at heart rate (too short for heart rate to settle). */
export const EFFICIENCY_MIN_M = 400;
/** Weeks compared for pace at the same heart rate. */
export const EFFICIENCY_WEEKS = 4;

/**
 * aerobic_efficiency: pace at the same heart rate. Each run or interval rep with a distance and an average heart rate
 * gives an efficiency factor (speed in m/min ÷ heart rate, endurance.ts); the last 4 weeks are compared with the 4
 * before. Reps from Spotter sessions only (heart rate from the watch).
 */
export function aerobicEfficiency(days: ClientDay[]): Pattern | null {
  const last = days.at(-1);
  if (!last) return null;
  const t = dayNum(last.date);
  // Like with like: each rep's efficiency against the median of the same workout's reps (an easy 7 km and a
  // threshold kilometre aren't compared with each other), in %.
  const raw = days.flatMap((day) =>
    day.training.sessions.flatMap((s) =>
      (s.scores ?? [])
        .filter((sc) => sc.kind === 'intervals')
        .flatMap((sc) =>
          sc.splits
            .filter((x) => x.distanceM != null && x.distanceM >= EFFICIENCY_MIN_M && x.avgHr != null && x.sec > 0)
            .map((x) => ({ key: sc.key, age: t - dayNum(day.date), ef: efficiencyFactor(x.distanceM! / (x.sec / 60), x.avgHr!) }))
            .filter((x): x is { key: string; age: number; ef: number } => x.ef != null),
        ),
    ),
  );
  const span = EFFICIENCY_WEEKS * 7;
  const inWindow = raw.filter((r) => r.age < 2 * span);
  const medians = new Map<string, number>();
  for (const k of new Set(inWindow.map((r) => r.key))) medians.set(k, median(inWindow.filter((r) => r.key === k).map((r) => r.ef)));
  const rel = inWindow.map((r) => ({ age: r.age, pct: (r.ef / medians.get(r.key)! - 1) * 100 }));
  const recent = rel.filter((r) => r.age < span).map((r) => r.pct);
  const before = rel.filter((r) => r.age >= span).map((r) => r.pct);
  const c = compareMeans(recent, before);
  if (!c?.confidence) return null;
  const change = c.diff;
  if (Math.abs(change) < CONDITIONING_MIN_PCT) return null;
  const faster = change > 0;
  return {
    id: 'aerobic_efficiency',
    kind: 'aerobic_efficiency',
    title: `Running ${pct(change)} ${faster ? 'faster' : 'slower'} at the same heart rate than a month before`,
    detail: `${c.nA} runs and reps in the last ${EFFICIENCY_WEEKS} weeks vs ${c.nB} in the ${EFFICIENCY_WEEKS} before, each against the same workout’s usual (speed ÷ average heart rate, ${EFFICIENCY_MIN_M} m or more)`,
    effect: { value: r1(change), unit: '%' },
    n: { a: c.nA, b: c.nB },
    confidence: confidenceOf(c),
    suggestion: faster ? 'The aerobic base is building: keep the easy running easy.' : 'Look at sleep, heat and fuelling before adding more hard running.',
    domains: ['aerobic', 'training'],
  };
}

/**
 * Simulations needed before the compromised-running pattern speaks. An exception to MIN_GROUP_N: a client does a full
 * simulation every couple of weeks, so the station's group is one run per simulation.
 */
export const COMPROMISED_MIN_SIMS = 4;

/**
 * compromised_running: across race simulations, the runs straight after one station against the client's other runs
 * (each as % slower than that simulation's first run; hyrox.ts compromised running). The station with the biggest
 * average drop is tested.
 */
export function compromisedRunningPattern(days: ClientDay[]): Pattern | null {
  const sims = days.flatMap((d) => d.training.sessions.flatMap((s) => (s.scores ?? []).filter((sc) => sc.kind === 'station_race')));
  const after = new Map<string, number[]>();
  const all: { station: string; pct: number }[] = [];
  for (const sim of sims) {
    let prev: string | null = null;
    let first: number | null = null;
    for (const x of sim.splits) {
      if (x.kind === 'station') prev = x.name;
      if (x.kind !== 'run' || !x.sec) continue;
      const pace = x.sec / ((x.distanceM ?? 1000) / 1000);
      if (first == null) {
        first = pace;
        continue;
      }
      if (!prev) continue;
      const v = (pace / first - 1) * 100;
      after.set(prev, [...(after.get(prev) ?? []), v]);
      all.push({ station: prev, pct: v });
    }
  }
  const top = [...after.entries()].filter(([, xs]) => xs.length >= COMPROMISED_MIN_SIMS).sort((a, b) => mean(b[1]) - mean(a[1]))[0];
  if (!top) return null;
  const others = all.filter((x) => x.station !== top[0]).map((x) => x.pct);
  const c = compareMeans(top[1], others, COMPROMISED_MIN_SIMS);
  if (!c?.confidence || c.diff < 3) return null;
  const station = top[0].toLowerCase().replace(/^skierg$/, 'the SkiErg');
  return {
    id: `compromised_running:${top[0]}`,
    kind: 'compromised_running',
    title: `Runs after ${station} tend to be ${pct(c.diff)} slower than the other runs`,
    detail: `${plural(c.nA, 'run')} after ${station} vs ${c.nB} other runs, across ${plural(sims.length, 'race simulation')}, each against that simulation’s first run`,
    effect: { value: r1(c.diff), unit: '%' },
    n: { a: c.nA, b: c.nB },
    confidence: confidenceOf(c),
    suggestion: `Practise running straight off ${station}: short ${station} efforts into 400–800 m at race pace.`,
    domains: ['race', 'aerobic'],
  };
}

export interface PatternOptions {
  /** The client's cycle calibration, only when the client shares it. */
  calibration?: Calibration | null;
}

export const DETECTORS: ((days: ClientDay[]) => Pattern | null)[] = [
  recoveryTime,
  sleepPerformance,
  sleepRpe,
  fuelPerformance,
  volumeResponse,
  mobilitySoreness,
  timeOfDay,
  conditioningSleep,
  conditioningTrend,
  aerobicEfficiency,
  compromisedRunningPattern,
];

/** Every pattern the data supports (medium or high confidence), most confident first, then biggest effect. */
export function findPatterns(days: ClientDay[], opts: PatternOptions = {}): Pattern[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  // Detectors read neighbouring days by index, so the history has to be one row per calendar day.
  const contiguous = sorted.every((d, i) => i === 0 || dayNum(d.date) - dayNum(sorted[i - 1]!.date) === 1);
  if (!contiguous) throw new Error('findPatterns needs one ClientDay per day (use buildTimeline).');
  const out = [...DETECTORS.map((f) => f(sorted)), cyclePhasePattern(opts.calibration)].filter((p): p is Pattern => p != null && p.confidence !== 'low');
  return out.sort((a, b) => RANK[b.confidence] - RANK[a.confidence] || Math.abs(b.effect.value) - Math.abs(a.effect.value));
}
