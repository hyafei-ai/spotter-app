import { STARTER_LIBRARY } from './library';
import { estimatedOneRepMax } from './records';
import type { CalibrationInput, CalibrationSession } from './physiology';
import type { CyclePhase } from './signals';

/**
 * Progress beyond raw PRs (docs/features/brief.md). Raw one-rep-max PRs get rare after the first
 * years of training, and a stalled number wears motivation down, so this finds the other honest wins:
 * more reps at a weight, a rising estimated max, the best lift in a given cycle phase (compared only
 * with that phase), and showing up week after week. Every win is computed from logged sets; nothing
 * is invented or rounded up.
 */

const DAY = 86_400_000;
const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const r1 = (n: number) => Math.round(n * 10) / 10;

const LIB_NAMES: Record<string, string> = Object.fromEntries(STARTER_LIBRARY.map((e) => [e.id, e.name]));
const nameOf = (id: string, names?: Record<string, string>) => names?.[id] ?? LIB_NAMES[id] ?? id;

/** How each phase reads inside a sentence: "strongest luteal-phase Back Squat yet". */
export const PHASE_ADJECTIVE: Record<CyclePhase, string> = {
  menstrual: 'period-week',
  follicular: 'follicular-phase',
  ovulation: 'ovulation-week',
  luteal: 'luteal-phase',
};

export type WinKind = 'raw_best' | 'phase_best' | 'rep_best';

export interface ProgressWin {
  kind: WinKind;
  date: string;
  exerciseId: string;
  text: string;
  value: number;
  previous: number;
  phase?: CyclePhase;
}

function bestE1rm(s: CalibrationSession, exerciseId: string): number | null {
  let best: number | null = null;
  for (const set of s.sets) {
    if (set.exerciseId !== exerciseId) continue;
    const e = estimatedOneRepMax(set.weightKg, set.reps);
    if (e != null) best = Math.max(best ?? 0, e);
  }
  return best;
}

const sortSessions = (sessions: CalibrationSession[]) => [...sessions].sort((a, b) => a.date.localeCompare(b.date));
const exercisesIn = (sessions: CalibrationSession[]) => [...new Set(sessions.flatMap((s) => s.sets.map((x) => x.exerciseId)))];

/** A new best estimated max, compared with everything logged before. Needs earlier history to beat. */
export function rawBests(sessions: CalibrationSession[], names?: Record<string, string>): ProgressWin[] {
  const out: ProgressWin[] = [];
  const sorted = sortSessions(sessions);
  for (const ex of exercisesIn(sorted)) {
    let prev: number | null = null;
    for (const s of sorted) {
      const e = bestE1rm(s, ex);
      if (e == null) continue;
      if (prev != null && e > prev + 1e-6) {
        out.push({ kind: 'raw_best', date: s.date, exerciseId: ex, value: r1(e), previous: r1(prev), text: `Best ${nameOf(ex, names)} yet: about ${r1(e)} kg estimated max (was ${r1(prev)} kg)` });
      }
      prev = Math.max(prev ?? 0, e);
    }
  }
  return out;
}

/** More reps at a weight than ever before at that same weight (or heavier). */
export function repBests(sessions: CalibrationSession[], names?: Record<string, string>): ProgressWin[] {
  const out: ProgressWin[] = [];
  const sorted = sortSessions(sessions);
  // exerciseId → [weightKg, reps][] seen so far
  const seen = new Map<string, [number, number][]>();
  for (const s of sorted) {
    const todays = new Map<string, [number, number]>();
    for (const set of s.sets) {
      if (set.weightKg <= 0 || set.reps < 1) continue;
      const key = `${set.exerciseId}@${set.weightKg}`;
      const cur = todays.get(key);
      if (!cur || set.reps > cur[1]) todays.set(key, [set.weightKg, set.reps]);
    }
    for (const [key, [w, reps]] of todays) {
      const ex = key.slice(0, key.lastIndexOf('@'));
      const history = seen.get(ex) ?? [];
      const atOrAbove = history.filter(([hw]) => hw >= w - 1e-6);
      const atSame = history.filter(([hw]) => Math.abs(hw - w) < 1e-6);
      if (atSame.length) {
        const prev = Math.max(...atOrAbove.map(([, r]) => r));
        if (reps > prev) {
          out.push({ kind: 'rep_best', date: s.date, exerciseId: ex, value: reps, previous: prev, text: `${reps} reps at ${w} kg on ${nameOf(ex, names)}: the most you’ve done at that weight` });
        }
      }
    }
    for (const [key, pair] of todays) {
      const ex = key.slice(0, key.lastIndexOf('@'));
      seen.set(ex, [...(seen.get(ex) ?? []), pair]);
    }
  }
  return out;
}

/**
 * Best estimated max in a cycle phase, compared only with that same phase's earlier best. Works when
 * cycle data exists (`phaseOn` returns a phase); without it (null, hormonal contraception,
 * post-menopause, not tracking) there are simply no phase wins.
 */
export function phaseBests(sessions: CalibrationSession[], phaseOn: CalibrationInput['phaseOn'] | null, names?: Record<string, string>): ProgressWin[] {
  if (!phaseOn) return [];
  const out: ProgressWin[] = [];
  const sorted = sortSessions(sessions);
  const phases = new Map<string, CyclePhase | null>();
  for (const s of sorted) {
    let phase: CyclePhase | null = null;
    try {
      const est = phaseOn(s.date);
      phase = est.confidence !== 'none' ? est.phase : null;
    } catch {
      phase = null;
    }
    phases.set(s.date, phase);
  }
  for (const ex of exercisesIn(sorted)) {
    const best = new Map<CyclePhase, number>();
    for (const s of sorted) {
      const phase = phases.get(s.date);
      const e = bestE1rm(s, ex);
      if (!phase || e == null) continue;
      const prev = best.get(phase);
      if (prev != null && e > prev + 1e-6) {
        out.push({
          kind: 'phase_best',
          date: s.date,
          exerciseId: ex,
          phase,
          value: r1(e),
          previous: r1(prev),
          text: `Strongest ${PHASE_ADJECTIVE[phase]} ${nameOf(ex, names)} yet: about ${r1(e)} kg estimated max (your last best in this phase was ${r1(prev)} kg)`,
        });
      }
      best.set(phase, Math.max(prev ?? 0, e));
    }
  }
  return out;
}

export interface WinsInput {
  sessions: CalibrationSession[];
  phaseOn: CalibrationInput['phaseOn'] | null;
  names?: Record<string, string>;
}

/**
 * All wins, newest first. When a raw best and a phase best land on the same lift and day, the raw
 * best says it plainly and the phase best is dropped.
 */
export function progressWins(input: WinsInput): ProgressWin[] {
  const raw = rawBests(input.sessions, input.names);
  const rawKeys = new Set(raw.map((w) => `${w.date}|${w.exerciseId}`));
  const phase = phaseBests(input.sessions, input.phaseOn, input.names).filter((w) => !rawKeys.has(`${w.date}|${w.exerciseId}`));
  const reps = repBests(input.sessions, input.names);
  const order: Record<WinKind, number> = { raw_best: 0, phase_best: 1, rep_best: 2 };
  return [...raw, ...phase, ...reps].sort((a, b) => b.date.localeCompare(a.date) || order[a.kind] - order[b.kind]);
}

/* ---------- estimated-max trend ---------- */

export interface E1rmTrend {
  exerciseId: string;
  name: string;
  /** Best estimated max per session in the window, oldest first. */
  points: { date: string; e1rm: number }[];
  /** Least-squares slope over the window as % of the window's mean, scaled to 6 weeks. Null under 3 sessions. */
  slopePct: number | null;
  direction: 'up' | 'flat' | 'down' | 'unknown';
}

export const TREND_WEEKS = 6;

export function e1rmTrend(sessions: CalibrationSession[], exerciseId: string, today: string, names?: Record<string, string>): E1rmTrend {
  const t = dayNum(today);
  const points = sortSessions(sessions)
    .filter((s) => t - dayNum(s.date) >= 0 && t - dayNum(s.date) < TREND_WEEKS * 7)
    .map((s) => ({ date: s.date, e1rm: bestE1rm(s, exerciseId) }))
    .filter((p): p is { date: string; e1rm: number } => p.e1rm != null)
    .map((p) => ({ date: p.date, e1rm: r1(p.e1rm) }));
  const name = nameOf(exerciseId, names);
  if (points.length < 3) return { exerciseId, name, points, slopePct: null, direction: 'unknown' };
  const xs = points.map((p) => dayNum(p.date));
  const ys = points.map((p) => p.e1rm);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const slopePerDay = den === 0 ? 0 : xs.reduce((a, x, i) => a + (x - mx) * (ys[i]! - my), 0) / den;
  const slopePct = my > 0 ? r1(((slopePerDay * TREND_WEEKS * 7) / my) * 100) : 0;
  return { exerciseId, name, points, slopePct, direction: slopePct >= 2 ? 'up' : slopePct <= -2 ? 'down' : 'flat' };
}

/** Plain words for a trend, no hype: "Back Squat: up about 4% over 6 weeks". */
export function trendText(t: E1rmTrend): string {
  if (t.slopePct == null) return `${t.name}: a few more sessions and there’ll be a trend`;
  if (t.direction === 'up') return `${t.name}: up about ${Math.abs(t.slopePct)}% over ${TREND_WEEKS} weeks`;
  if (t.direction === 'down') return `${t.name}: down about ${Math.abs(t.slopePct)}% over ${TREND_WEEKS} weeks`;
  return `${t.name}: holding steady over ${TREND_WEEKS} weeks`;
}

/** The lifts worth a trend line: the ones with the most sessions in the window. */
export function mainLifts(sessions: CalibrationSession[], today: string, max = 3): string[] {
  const t = dayNum(today);
  const counts = new Map<string, number>();
  for (const s of sessions) {
    if (t - dayNum(s.date) < 0 || t - dayNum(s.date) >= TREND_WEEKS * 7) continue;
    for (const ex of new Set(s.sets.filter((x) => estimatedOneRepMax(x.weightKg, x.reps) != null).map((x) => x.exerciseId))) {
      counts.set(ex, (counts.get(ex) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([id]) => id);
}

/* ---------- consistency ---------- */

export interface ConsistencyWeek {
  /** First day of the 7-day block (blocks end today). */
  from: string;
  done: number;
  planned: number | null;
}

export interface Consistency {
  /** Oldest first. */
  weeks: ConsistencyWeek[];
  /** Consecutive weeks (ending this week, or last week if this one isn't there yet) with 2+ sessions. */
  streak: number;
  done: number;
  planned: number | null;
}

export const STEADY_SESSIONS_PER_WEEK = 2;

/** Sessions done (and planned, when the program says) in 7-day blocks ending today. */
export function consistency(sessionDates: string[], today: string, weeks = 8, plannedPerWeek: number | null = null): Consistency {
  const t = dayNum(today);
  const blocks: ConsistencyWeek[] = Array.from({ length: weeks }, (_, i) => {
    const end = t - (weeks - 1 - i) * 7;
    const start = end - 6;
    const done = sessionDates.filter((d) => dayNum(d) >= start && dayNum(d) <= end).length;
    return { from: new Date(start * DAY).toISOString().slice(0, 10), done, planned: plannedPerWeek };
  });
  let streak = 0;
  let i = blocks.length - 1;
  if (blocks[i] && blocks[i]!.done < STEADY_SESSIONS_PER_WEEK) i--; // this week may still be in progress
  for (; i >= 0 && blocks[i]!.done >= STEADY_SESSIONS_PER_WEEK; i--) streak++;
  return {
    weeks: blocks,
    streak,
    done: blocks.reduce((a, b) => a + b.done, 0),
    planned: plannedPerWeek == null ? null : plannedPerWeek * weeks,
  };
}

export function consistencyText(c: Consistency): string {
  if (c.streak >= 2) return `${c.streak} weeks in a row with 2 or more sessions`;
  if (c.planned) return `${c.done} of ${c.planned} planned sessions in the last ${c.weeks.length} weeks`;
  return `${c.done} sessions in the last ${c.weeks.length} weeks`;
}

/* ---------- stalled (for PhysiologySignals) ---------- */

export const STALL_WEEKS = 8;

/**
 * Stalled: 8 weeks of steady training (2+ sessions every week) with no new best of any kind (raw,
 * phase-calibrated or reps at a weight). Not stalled when training wasn't steady: that's a different
 * conversation.
 */
export function progressStalled(input: WinsInput & { today: string }): boolean {
  const t = dayNum(input.today);
  const c = consistency(input.sessions.map((s) => s.date), input.today, STALL_WEEKS);
  if (c.weeks.some((w) => w.done < STEADY_SESSIONS_PER_WEEK)) return false;
  const wins = progressWins(input).filter((w) => t - dayNum(w.date) < STALL_WEEKS * 7);
  return wins.length === 0;
}
