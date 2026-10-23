import { estimatedOneRepMax } from './records';
import { CYCLE_PHASES, type CyclePhase } from './signals';
import { CONFIDENCE_RANK, PHASE_WORDS } from './cycle';
import type { Calibration, CalibrationInput, CalibrationSession, Calibrator, Confidence, PhaseAdjustment } from './physiology';

/**
 * Cycle-phase performance calibration (docs/physiology.md, docs/features/cycle.md).
 *
 * `personal-baseline-v1` is a transparent method: each session's lifts are compared with the athlete's
 * own rolling baseline for that lift, the differences are averaged per phase, shrunk toward zero until
 * enough sessions back them, and only applied (small, capped) once the estimate is precise. It is not
 * the proprietary method: that one plugs in through the same `Calibrator` interface (CALIBRATORS).
 */

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);

/** Rolling baseline window for each lift, in days before the session. */
export const CALIBRATION_BASELINE_DAYS = 56;
/** A lift needs at least this many earlier sessions in the window before it is compared. */
export const BASELINE_MIN = 3;
/** Shrinkage: deltaPct × n / (n + k). With k = 6, six sessions halve a phase's raw average. */
export const SHRINK_K = 6;
/** Before a phase counts as at least "medium": this many sessions across this many cycles… */
export const MIN_PHASE_SESSIONS = 4;
export const MIN_PHASE_CYCLES = 2;
/** …and a standard error of the phase average at most this (percentage points). Noisy data stays "low". */
export const MAX_SE_MEDIUM = 1.5;
export const MAX_SE_HIGH = 1;
/** Only differences at least this big change a suggested load, and never by more than the cap. */
export const APPLY_MIN_PCT = 2;
export const APPLY_CAP_PCT = 5;
/**
 * Effort signal: at the same load and reps, each point of RPE above the athlete's own usual for that
 * set counts as about 3% under baseline. An approximation (rough RPE-to-%1RM charts), labelled as such.
 */
export const PCT_PER_RPE = 3;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Best estimated 1RM per exercise in a session (Epley, sets of 1–12 reps). */
function bestE1rm(s: CalibrationSession): Map<string, number> {
  const out = new Map<string, number>();
  for (const set of s.sets) {
    const e = estimatedOneRepMax(set.weightKg, set.reps);
    if (e != null && e > (out.get(set.exerciseId) ?? 0)) out.set(set.exerciseId, e);
  }
  return out;
}

/**
 * One number per session: how its lifts ran against the athlete's own recent baseline, in %.
 * Null when no lift has a baseline yet. Exported for tests and for the explainer.
 */
export function sessionDeltas(sessions: CalibrationSession[]): { date: string; deltaPct: number }[] {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const bests = sorted.map(bestE1rm);
  const out: { date: string; deltaPct: number }[] = [];
  sorted.forEach((s, i) => {
    const t = dayNum(s.date);
    const prior = sorted
      .map((p, j) => ({ p, j }))
      .filter(({ p, j }) => j !== i && dayNum(p.date) < t && t - dayNum(p.date) <= CALIBRATION_BASELINE_DAYS);
    const deltas: number[] = [];
    for (const [exerciseId, e1rm] of bests[i]!) {
      const history = prior.map(({ j }) => bests[j]!.get(exerciseId)).filter((x): x is number => x != null);
      if (history.length < BASELINE_MIN) continue;
      let delta = (e1rm / median(history) - 1) * 100;
      // Effort: the same load and reps felt harder (higher RPE) than usual → worse than baseline.
      const effort: number[] = [];
      for (const set of s.sets) {
        if (set.exerciseId !== exerciseId || set.rpe == null) continue;
        const usual = prior
          .flatMap(({ p }) => p.sets)
          .filter((x) => x.exerciseId === exerciseId && x.rpe != null && x.reps === set.reps && Math.abs(x.weightKg - set.weightKg) < 0.01)
          .map((x) => x.rpe!);
        if (usual.length) effort.push(-(set.rpe - median(usual)) * PCT_PER_RPE);
      }
      if (effort.length) delta += mean(effort);
      deltas.push(delta);
    }
    if (deltas.length) out.push({ date: s.date, deltaPct: mean(deltas) });
  });
  return out;
}

function confidenceFor(n: number, cycles: number, se: number): Confidence {
  if (n === 0) return 'none';
  if (n < MIN_PHASE_SESSIONS || cycles < MIN_PHASE_CYCLES || se > MAX_SE_MEDIUM) return 'low';
  if (n >= 8 && cycles >= 4 && se <= MAX_SE_HIGH) return 'high';
  return 'medium';
}

/** Small, capped, rounded to 0.5%, and only when confident. */
function applied(shrunk: number, confidence: Confidence): number {
  if (CONFIDENCE_RANK[confidence] < CONFIDENCE_RANK.medium || Math.abs(shrunk) < APPLY_MIN_PCT) return 0;
  const capped = Math.max(-APPLY_CAP_PCT, Math.min(APPLY_CAP_PCT, shrunk));
  return Math.round(capped * 2) / 2 || 0;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

function summarise(adjustments: PhaseAdjustment[], cyclesObserved: number, ready: boolean): string {
  if (adjustments.every((a) => a.sessions === 0)) {
    return 'Not enough of your own training data yet. The app needs at least 2 cycles and 4 sessions in a phase before it changes anything.';
  }
  const lead = `${ready ? 'After' : 'Early read from'} ${plural(cyclesObserved, 'cycle')} of your own data`;
  const used = adjustments.filter((a) => a.appliedPct !== 0);
  if (used.length) {
    const parts = used.map((a) => {
      const dir = a.deltaPct < 0 ? 'under' : 'over';
      return `your lifts in the ${PHASE_WORDS[a.phase]} run about ${Math.round(Math.abs(a.deltaPct))}% ${dir} your usual, so suggested loads are ${Math.abs(a.appliedPct)}% ${a.appliedPct < 0 ? 'lighter' : 'heavier'} then`;
    });
    return `${lead}: ${parts.join('; ')}.`;
  }
  if (ready) return `${lead}: your lifts run close to your usual in every phase, so suggested loads stay as planned.`;
  const biggest = [...adjustments].filter((a) => a.sessions > 0).sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))[0]!;
  return `${lead}: nothing changes yet. The app waits for at least 2 cycles and 4 steady sessions in a phase (biggest difference so far: ${PHASE_WORDS[biggest.phase]}, ${round1(biggest.deltaPct)}% over ${plural(biggest.sessions, 'session')}).`;
}

/** The transparent personal-baseline method. */
export const personalBaseline: Calibrator = {
  id: 'personal-baseline-v1',
  label: 'Your own baseline',
  calibrate(input: CalibrationInput): Calibration {
    const today = dayNum(input.today);
    const past = input.sessions.filter((s) => dayNum(s.date) <= today);
    const groups = new Map<CyclePhase, { deltas: number[]; cycles: Set<string> }>();
    const allCycles = new Set<string>();
    for (const d of sessionDeltas(past)) {
      const e = input.phaseOn(d.date);
      if (!e.phase || e.dayOfCycle == null) continue;
      const cycle = String(dayNum(d.date) - e.dayOfCycle + 1);
      allCycles.add(cycle);
      const g = groups.get(e.phase) ?? { deltas: [], cycles: new Set<string>() };
      g.deltas.push(d.deltaPct);
      g.cycles.add(cycle);
      groups.set(e.phase, g);
    }
    const adjustments: PhaseAdjustment[] = CYCLE_PHASES.map((phase) => {
      const g = groups.get(phase);
      const n = g?.deltas.length ?? 0;
      if (!g || n === 0) return { phase, deltaPct: 0, appliedPct: 0, sessions: 0, cycles: 0, confidence: 'none' as const };
      const m = mean(g.deltas);
      const sd = n > 1 ? Math.sqrt(g.deltas.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)) : Infinity;
      const se = sd / Math.sqrt(n);
      const shrunk = (m * n) / (n + SHRINK_K);
      const confidence = confidenceFor(n, g.cycles.size, se);
      return { phase, deltaPct: round1(shrunk), appliedPct: applied(shrunk, confidence), sessions: n, cycles: g.cycles.size, confidence };
    });
    const ready = adjustments.some((a) => CONFIDENCE_RANK[a.confidence] >= CONFIDENCE_RANK.medium);
    return { method: personalBaseline.id, ready, cyclesObserved: allCycles.size, adjustments, summary: summarise(adjustments, allCycles.size, ready) };
  },
};

/**
 * Calibration methods by id. A proprietary method registers here and becomes active by changing
 * ACTIVE_CALIBRATOR; the UI only reads the `Calibration` it returns.
 */
export const CALIBRATORS: Record<string, Calibrator> = { [personalBaseline.id]: personalBaseline };
export const ACTIVE_CALIBRATOR = personalBaseline.id;
export function activeCalibrator(id: string = ACTIVE_CALIBRATOR): Calibrator {
  return CALIBRATORS[id] ?? personalBaseline;
}

/** The adjustment the app applies for a phase (0 = none). */
export function appliedPctFor(calibration: Calibration | null, phase: CyclePhase | null): number {
  if (!calibration || !phase) return 0;
  return calibration.adjustments.find((a) => a.phase === phase)?.appliedPct ?? 0;
}

/**
 * A suggested load after calibration, rounded to the plate increment. Only for suggestions: logged
 * values are never rounded or changed. With no adjustment the planned load comes back untouched.
 */
export function calibratedLoad(plannedKg: number, calibration: Calibration | null, phase: CyclePhase | null, incrementKg: number): number {
  const pct = appliedPctFor(calibration, phase);
  if (pct === 0 || plannedKg <= 0) return plannedKg;
  const inc = incrementKg > 0 ? incrementKg : 2.5;
  return Math.max(0, Math.round((plannedKg * (1 + pct / 100)) / inc) * inc);
}

/** "Loads 3.5% lighter today: your lifts run lower in the luteal phase (5 cycles of your own data)." */
export function calibrationLine(calibration: Calibration | null, phase: CyclePhase | null): string | null {
  const pct = appliedPctFor(calibration, phase);
  if (!pct || !phase || !calibration) return null;
  const a = calibration.adjustments.find((x) => x.phase === phase)!;
  return `Loads ${Math.abs(pct)}% ${pct < 0 ? 'lighter' : 'heavier'} today: your lifts run ${pct < 0 ? 'lower' : 'higher'} in the ${PHASE_WORDS[phase]} (${plural(a.cycles, 'cycle')} of your own data).`;
}
