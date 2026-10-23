import { z } from 'zod';
import { formatRaceTime, isPlausibleSimDuration } from './hyrox';
import type { ReadTone } from './signals';
import { SIM_DIVISIONS } from './templates/raceSims';

/**
 * Race goals, a finish-time estimate and readiness for a race (docs/ports.md row 5), ported from Station Zero's
 * raceFinishPredictor.ts and raceReadiness.ts with fixes:
 * - Trend units: the source's slope was in seconds per day but was multiplied by weeks to race, understating the
 *   trend about 7×. Here: seconds per day × days to race.
 * - Format filter: the source kept full simulations for a half race and half simulations for a full race
 *   (`isFull !== isHalf ? false : true`). Here: full for full, half for half.
 * - `today` is a parameter (the source read the clock inside).
 * - Dropped adjustments with made-up sizes: the 0–100 recovery factor (−1.5% to +5%), the cycle-phase factor
 *   (−0.5% to +1.5%) and the +3% "no specific training" penalty. Recovery is a readiness dimension instead, read
 *   from Spotter's own daily read; specificity is evidence, not an adjustment.
 * - Dropped the fixed ±2.5/5/8% bands: the range comes from the athlete's own spread of results.
 * - Readiness has no composite score or verdict: five dimensions, each a plain reading and one action.
 */

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY);
const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ---------- the goal ---------- */

export const RACE_KINDS = ['race_sim', 'run', 'other'] as const;
export const RaceGoal = z.object({
  /** "Hyrox Manchester", "Berlin Marathon". */
  event: z.string().trim().min(1).max(80),
  kind: z.enum(RACE_KINDS),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** The athlete's target, or null when they just want to finish. */
  targetSec: z.number().int().positive().nullable(),
  /** Race-format division, or null for other races. */
  division: z.enum(SIM_DIVISIONS).nullable(),
  format: z.enum(['full', 'half']).nullable(),
});
export type RaceGoal = z.infer<typeof RaceGoal>;

/** Whole days from `today` to the race; negative once it's past. */
export function daysToRace(raceDate: string, today: string): number {
  return dayNum(raceDate) - dayNum(today);
}

/* ---------- finish estimate ---------- */

export interface RaceResultInput {
  date: string;
  sec: number;
  format: 'full' | 'half';
}

/**
 * The trend never moves the estimate by more than this share of the best time. A guard against a steep line through
 * a few points, not a statistic.
 */
export const TREND_CAP_PCT = 8;
/** Results this inconsistent (coefficient of variation) don't get a trend line. Same guard as the source. */
export const TREND_MAX_CV = 0.3;
/** A trend needs this many simulations of the race's format. */
export const TREND_MIN_SIMS = 3;

export interface FinishEstimate {
  estimateSec: number | null;
  /** The range from the athlete's own spread of results; null with a single result. */
  lowSec: number | null;
  highSec: number | null;
  anchor: { source: 'race' | 'sim'; sec: number; date: string } | null;
  trend: { secPerWeek: number; projectedSec: number; capped: boolean } | null;
  daysOut: number;
  /** "Based on 3 full simulations, most recent 12 days ago". */
  evidence: string;
  /** Plain lines for "How this is worked out". */
  lines: string[];
}

/** Least-squares slope (seconds per day) and residual SD; null when the dates don't spread. */
function fit(points: { x: number; y: number }[]): { slope: number; residualSd: number } | null {
  const mx = mean(points.map((p) => p.x));
  const my = mean(points.map((p) => p.y));
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const res = points.map((p) => p.y - (my + slope * (p.x - mx)));
  const residualSd =
    points.length > 2 ? Math.sqrt(res.reduce((a, r) => a + r * r, 0) / (points.length - 2)) : 0;
  return { slope, residualSd };
}

const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

/**
 * Finish estimate for a race-format event: anchored on the best official result of the same format, else the
 * best simulation; moved by the simulation trend (seconds per day × days to race, capped); with a range from the
 * athlete's own spread. Null estimate (with evidence saying why) when there's nothing to anchor on.
 */
export function predictRaceFinish(input: {
  race: { date: string; format: 'full' | 'half' };
  today: string;
  officialRaces: RaceResultInput[];
  sims: RaceResultInput[];
  /** Date of the latest race-format session of any kind, for the evidence line. */
  lastRaceFormatSession?: string | null;
}): FinishEstimate {
  const { race, today } = input;
  const daysOut = daysToRace(race.date, today);
  const half = race.format === 'half';
  const past = (r: RaceResultInput) =>
    dayNum(r.date) <= dayNum(today) &&
    r.format === race.format &&
    isPlausibleSimDuration(r.sec, half);
  const races = input.officialRaces.filter(past);
  const sims = input.sims.filter(past).sort((a, b) => dayNum(a.date) - dayNum(b.date));
  const all = [...races, ...sims];
  const word = race.format;

  if (!all.length) {
    return {
      estimateSec: null,
      lowSec: null,
      highSec: null,
      anchor: null,
      trend: null,
      daysOut,
      evidence: `No ${word} race or simulation logged yet`,
      lines: [`Log one ${word} simulation to see an estimate`],
    };
  }

  const best = (xs: RaceResultInput[]) => xs.reduce((a, b) => (b.sec < a.sec ? b : a));
  const anchorRow = races.length ? best(races) : best(sims);
  const anchor = {
    source: (races.length ? 'race' : 'sim') as 'race' | 'sim',
    sec: anchorRow.sec,
    date: anchorRow.date,
  };

  let trend: FinishEstimate['trend'] = null;
  let residualSd: number | null = null;
  if (sims.length >= TREND_MIN_SIMS && daysOut > 0) {
    const secs = sims.map((s) => s.sec);
    const cv = sd(secs) / mean(secs);
    const f = cv <= TREND_MAX_CV ? fit(sims.map((s) => ({ x: dayNum(s.date), y: s.sec }))) : null;
    if (f) {
      const raw = f.slope * daysOut;
      const cap = (anchor.sec * TREND_CAP_PCT) / 100;
      const projected = Math.max(-cap, Math.min(cap, raw));
      trend = {
        secPerWeek: r1(f.slope * 7),
        projectedSec: Math.round(projected),
        capped: projected !== raw,
      };
      residualSd = f.residualSd;
    }
  }
  const estimate = Math.round(anchor.sec + (trend?.projectedSec ?? 0));
  const spread = residualSd ?? (all.length >= 2 ? sd(all.map((r) => r.sec)) : null);
  const lowSec = spread != null ? Math.round(estimate - spread) : null;
  const highSec = spread != null ? Math.round(estimate + spread) : null;

  const latest = Math.max(...all.map((r) => dayNum(r.date)));
  const ago = dayNum(today) - latest;
  const parts = [
    races.length ? plural(races.length, `official ${word} race`) : null,
    sims.length ? plural(sims.length, `${word} simulation`) : null,
  ].filter(Boolean);
  const evidence = `Based on ${parts.join(' and ')}, most recent ${ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`}`;

  const lines = [
    `Starts from the best ${anchor.source === 'race' ? 'official race' : 'simulation'}: ${formatRaceTime(anchor.sec)}`,
  ];
  if (trend) {
    const dir = trend.secPerWeek < 0 ? 'faster' : 'slower';
    lines.push(
      `Simulations are getting ${dir} by about ${Math.abs(Math.round(trend.secPerWeek))} s a week; over the ${daysOut} days to race day that's ${formatRaceTime(Math.abs(trend.projectedSec))} ${dir}${trend.capped ? ` (limited to ${TREND_CAP_PCT}% of the best time)` : ''}`,
    );
  } else if (sims.length < TREND_MIN_SIMS) {
    lines.push(`No trend yet: that needs ${TREND_MIN_SIMS} ${word} simulations`);
  }
  lines.push(
    lowSec != null
      ? `Range ${formatRaceTime(lowSec)} to ${formatRaceTime(highSec)}, from how much the results vary`
      : 'One result so far, so no range yet',
  );
  const last = input.lastRaceFormatSession;
  if (last !== undefined && daysOut > 0 && (last == null || dayNum(today) - dayNum(last) > 14))
    lines.push('No race-format session in the last 14 days');
  return { estimateSec: estimate, lowSec, highSec, anchor, trend, daysOut, evidence, lines };
}

/* ---------- readiness: dimensions, no score ---------- */

export type ReadinessPhase = 'build' | 'taper' | 'race_week' | 'past';
export type ReadinessKind = 'volume' | 'engine' | 'recovery' | 'specificity' | 'taper';

export interface ReadinessDimension {
  kind: ReadinessKind;
  label: string;
  /** What the data says, plainly. */
  reading: string;
  /** One thing to do about it. */
  action: string;
  /** True when the coach should look; null when there isn't enough data to say. */
  needsAttention: boolean | null;
}

export interface RaceReadiness {
  phase: ReadinessPhase;
  daysOut: number;
  dimensions: ReadinessDimension[];
}

export interface ReadinessSession {
  date: string;
  /** A race simulation or race-format session (hyrox.ts isHyroxSimulation, or built as one). */
  raceFormat: boolean;
  /** Finish time of a full or half simulation, for the engine reading. */
  finishSec?: number | null;
  format?: 'full' | 'half' | null;
  avgHr?: number | null;
}

export const READINESS_LABEL: Record<ReadinessKind, string> = {
  volume: 'Volume',
  engine: 'Engine',
  recovery: 'Recovery',
  specificity: 'Race-specific work',
  taper: 'Taper',
};

/** Days before the race the taper starts by default. A coaching choice the coach can change. */
export const DEFAULT_TAPER_DAYS = 14;

export function readinessPhase(daysOut: number, taperDays = DEFAULT_TAPER_DAYS): ReadinessPhase {
  return daysOut < 0
    ? 'past'
    : daysOut <= 7
      ? 'race_week'
      : daysOut <= taperDays
        ? 'taper'
        : 'build';
}

/**
 * Readiness for a race in five dimensions, each against the athlete's own history: volume (this month vs the
 * month before), engine (simulation times, else heart rate in race-format sessions), recovery (Spotter's daily
 * read over the last week), race-specific work, and taper. No composite score.
 */
export function raceReadiness(input: {
  race: { date: string; format: 'full' | 'half' | null };
  today: string;
  sessions: ReadinessSession[];
  /** The daily read's tone per day (signals.ts dailyRead), whatever is available for the last 7 days. */
  reads?: { date: string; tone: ReadTone }[];
  taperDays?: number;
}): RaceReadiness {
  const t = dayNum(input.today);
  const daysOut = daysToRace(input.race.date, input.today);
  const phase = readinessPhase(daysOut, input.taperDays);
  const age = (d: string) => t - dayNum(d);
  const within = (lo: number, hi: number) =>
    input.sessions.filter((s) => age(s.date) >= lo && age(s.date) < hi);
  const month = within(0, 28);
  const before = within(28, 56);
  const eight = within(0, 56);
  const building = phase === 'build';
  const dims: ReadinessDimension[] = [];

  // Volume
  if (!eight.length) {
    dims.push({
      kind: 'volume',
      label: READINESS_LABEL.volume,
      reading: 'No training logged in the last 8 weeks',
      action: 'Log or import sessions so this can be read',
      needsAttention: null,
    });
  } else {
    const n = month.length;
    const p = before.length;
    const cmp = n > p ? `up from ${p}` : n < p ? `down from ${p}` : 'the same as';
    dims.push({
      kind: 'volume',
      label: READINESS_LABEL.volume,
      reading: `${plural(n, 'session')} in the last 4 weeks, ${cmp} the 4 weeks before`,
      action:
        phase === 'past'
          ? 'Keep the week after the race easy'
          : !building
            ? 'Let volume come down; keep a few short, sharp efforts'
            : n < p
              ? `Get back toward ${p} sessions a month before adding anything new`
              : 'Hold this; no need to add volume now',
      needsAttention: building ? n < p : false,
    });
  }

  // Engine
  const fmt = input.race.format;
  const timed = eight
    .filter(
      (s) => s.raceFormat && s.finishSec != null && s.finishSec > 0 && (!fmt || s.format === fmt),
    )
    .sort((a, b) => dayNum(a.date) - dayNum(b.date));
  if (timed.length >= 2) {
    const first = timed[0]!;
    const last = timed[timed.length - 1]!;
    const delta = last.finishSec! - first.finishSec!;
    const word = delta < 0 ? 'faster' : delta > 0 ? 'slower' : 'the same as';
    dims.push({
      kind: 'engine',
      label: READINESS_LABEL.engine,
      reading: `Latest simulation ${formatRaceTime(last.finishSec)}, ${delta === 0 ? 'the same as' : `${formatRaceTime(Math.abs(delta))} ${word} than`} the first in the last 8 weeks (${plural(timed.length, 'simulation')})`,
      action:
        delta > 0
          ? 'Check recovery and fuelling before the next hard session'
          : 'Keep the current mix of work',
      needsAttention: delta > 0,
    });
  } else {
    const hr = (xs: ReadinessSession[]) =>
      xs.filter((s) => s.raceFormat && s.avgHr != null).map((s) => s.avgHr!);
    const now = hr(month);
    const then = hr(before);
    if (now.length >= 2 && then.length >= 2) {
      const a = Math.round(mean(now));
      const b = Math.round(mean(then));
      dims.push({
        kind: 'engine',
        label: READINESS_LABEL.engine,
        reading: `Average heart rate in race-format sessions: ${a} bpm in the last 4 weeks, ${b} bpm the 4 weeks before`,
        action:
          'To see the engine clearly, repeat a simulation or a 1 km time trial and compare times',
        needsAttention: null,
      });
    } else {
      dims.push({
        kind: 'engine',
        label: READINESS_LABEL.engine,
        reading: 'Not enough timed simulations to compare yet',
        action: building
          ? 'Log a simulation now and another in 3 to 4 weeks'
          : 'Use race day as the next comparison',
        needsAttention: null,
      });
    }
  }

  // Recovery, from the daily read
  const reads = (input.reads ?? []).filter((r) => age(r.date) >= 0 && age(r.date) < 7);
  if (!reads.length) {
    dims.push({
      kind: 'recovery',
      label: READINESS_LABEL.recovery,
      reading: 'No daily read this week',
      action: 'The daily read needs sleep, HRV or the daily check',
      needsAttention: null,
    });
  } else {
    const tired = reads.filter((r) => r.tone === 'ease').length;
    dims.push({
      kind: 'recovery',
      label: READINESS_LABEL.recovery,
      reading: tired
        ? `Running tired on ${tired} of the last ${plural(reads.length, 'day')} read`
        : `No tired days in the last ${plural(reads.length, 'day')} read`,
      action: tired >= 2 ? 'Ease the next hard session and protect sleep' : 'Nothing to change',
      needsAttention: tired >= 2,
    });
  }

  // Race-specific work
  const specific = month
    .filter((s) => s.raceFormat)
    .sort((a, b) => dayNum(b.date) - dayNum(a.date));
  if (!specific.length) {
    dims.push({
      kind: 'specificity',
      label: READINESS_LABEL.specificity,
      reading: 'No race-format session in the last 4 weeks',
      action: building
        ? 'Plan a half simulation in the next two weeks'
        : phase === 'past'
          ? 'Nothing needed now'
          : 'Too close for a full simulation; do a short race-pace opener instead',
      needsAttention: phase !== 'past',
    });
  } else {
    const ago = age(specific[0]!.date);
    dims.push({
      kind: 'specificity',
      label: READINESS_LABEL.specificity,
      reading: `${plural(specific.length, 'race-format session')} in the last 4 weeks, the latest ${ago === 0 ? 'today' : `${plural(ago, 'day')} ago`}`,
      action: building ? 'Keep race-format work in the plan' : 'Enough done; arrive fresh',
      needsAttention: false,
    });
  }

  // Taper
  const week = within(0, 7).length;
  const usual = eight.length ? r1(eight.length / 8) : null;
  const usualWords = usual != null ? `usually ${usual}` : 'no usual week yet';
  if (phase === 'past') {
    dims.push({
      kind: 'taper',
      label: READINESS_LABEL.taper,
      reading: `The race was ${plural(-daysOut, 'day')} ago`,
      action: 'Easy week to recover',
      needsAttention: false,
    });
  } else if (building) {
    dims.push({
      kind: 'taper',
      label: READINESS_LABEL.taper,
      reading: `Race in ${plural(daysOut, 'day')}: not tapering yet (${plural(week, 'session')} this week, ${usualWords})`,
      action: `Start easing off about ${input.taperDays ?? DEFAULT_TAPER_DAYS} days out`,
      needsAttention: false,
    });
  } else {
    const high = usual != null && week >= usual;
    dims.push({
      kind: 'taper',
      label: READINESS_LABEL.taper,
      reading: `Race in ${plural(daysOut, 'day')}: ${plural(week, 'session')} this week, ${usualWords}`,
      action: high
        ? 'Cut the number or length of sessions; keep some intensity'
        : 'Volume is already down; keep a few short efforts',
      needsAttention: usual == null ? null : high,
    });
  }

  return { phase, daysOut, dimensions: dims };
}
