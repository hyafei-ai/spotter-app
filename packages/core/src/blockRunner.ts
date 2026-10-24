import type { Block, BlockScore, BlockSplit } from './schemas';
import { EMPTY_SCORE } from './blocks';

/**
 * The block runner (docs/ports.md row 9): one pure timer state machine for every timed block kind (AMRAP countdown,
 * EMOM windows, tabata and interval-AMRAP work/rest, for time with a cap, interval reps with rest, race-sim segment
 * laps with undo). Ported in behaviour from Station Zero's AmrapTimer, WorkoutTimer, CircuitTimer and HyroxTimer
 * screens; rebuilt as data so the phone logger and the watch run the same rules.
 *
 * Everything is driven by a clock input: the state stores wall-clock times when something happened, and every
 * reading (`runnerView`) is computed from the state and `now`. Nothing ticks inside, so a runner survives the app
 * being killed (persist the state, read it back, call `runnerView` with the time now) and tests can step time.
 *
 * Times inside the state are "active" milliseconds: time since the work started, minus pauses and the lead-in.
 */

export type RunnerMode = 'countdown' | 'up' | 'windows' | 'intervals' | 'segments';

export interface RunnerSpec {
  mode: RunnerMode;
  /** "3-2-1" before clock-bound work starts. */
  leadInSec: number;
  /** Countdown length, the cap for "up", or the total of all windows. Null when open-ended. */
  totalSec: number | null;
  /** Work and rest per window, and how many windows (EMOM: rest 0). Time-based interval reps use these too. */
  workSec: number | null;
  restSec: number;
  rounds: number | null;
  /** What a tap of the big button counts, or null when the clock does everything. */
  lap: 'round' | 'rep' | 'segment' | null;
  /** Distance-rep intervals: metres per rep. */
  distanceM: number | null;
  /** Race-sim segments, in order. */
  segments: { name: string; kind: 'run' | 'station'; distanceM: number | null }[];
}

/** Seconds of lead-in before clock-bound work (the watch uses the same 3 s). */
export const LEAD_IN_SEC = 3;
/** How long a segment or rep lap can be undone, as on the watch. */
export const UNDO_WINDOW_SEC = 5;

/** The runner a block needs, or null for blocks that aren't run on a clock (strength, notes). */
export function runnerSpec(b: Block): RunnerSpec | null {
  const base: RunnerSpec = { mode: 'up', leadInSec: LEAD_IN_SEC, totalSec: null, workSec: null, restSec: 0, rounds: null, lap: null, distanceM: null, segments: [] };
  switch (b.kind) {
    case 'amrap':
      return { ...base, mode: 'countdown', totalSec: b.durationSec, lap: 'round' };
    case 'timed':
      return { ...base, mode: 'countdown', totalSec: b.durationSec };
    case 'rest':
      return { ...base, mode: 'countdown', leadInSec: 0, totalSec: b.durationSec };
    case 'emom':
      return { ...base, mode: 'windows', workSec: b.intervalSec, restSec: 0, rounds: b.rounds, totalSec: b.intervalSec * b.rounds };
    case 'tabata':
      return { ...base, mode: 'windows', workSec: b.workSec, restSec: b.restSec, rounds: b.rounds, totalSec: windowsTotal(b.workSec, b.restSec, b.rounds) };
    case 'interval_amrap':
      return { ...base, mode: 'windows', workSec: b.workSec, restSec: b.restSec, rounds: b.rounds, totalSec: windowsTotal(b.workSec, b.restSec, b.rounds), lap: 'round' };
    case 'for_time':
      return { ...base, mode: 'up', totalSec: b.timeCapSec };
    case 'rounds_for_time':
      return { ...base, mode: 'up', totalSec: b.timeCapSec, rounds: b.rounds, lap: b.rounds > 1 ? 'round' : null };
    case 'rep_scheme':
      return { ...base, mode: 'up', totalSec: b.timeCapSec, rounds: b.scheme.length, lap: 'round' };
    case 'intervals':
      return b.distanceM != null
        ? { ...base, mode: 'intervals', restSec: b.restSec, rounds: b.reps, lap: 'rep', distanceM: b.distanceM }
        : { ...base, mode: 'windows', workSec: b.workSec ?? 60, restSec: b.restSec, rounds: b.reps, totalSec: windowsTotal(b.workSec ?? 60, b.restSec, b.reps) };
    case 'station_race':
      return { ...base, mode: 'segments', lap: 'segment', rounds: b.segments.length, segments: b.segments.map((s) => ({ name: s.name, kind: s.kind, distanceM: s.distanceM })) };
    default:
      return null;
  }
}

/** Windows with rest between them, not after the last. */
export const windowsTotal = (work: number, rest: number, rounds: number) => rounds * work + Math.max(0, rounds - 1) * rest;

/* ---------- state and events ---------- */

export interface RunnerState {
  /** Wall-clock ms when Start was pressed (the lead-in begins then). Null before Start. */
  startedAt: number | null;
  /** Wall-clock ms when paused, or null while running. */
  pausedAt: number | null;
  /** Total paused ms so far. */
  pausedMs: number;
  /** Active ms at each lap (round, rep or segment done). */
  laps: number[];
  /** Wall-clock ms of the last lap, for the undo window. */
  lastLapWall: number | null;
  /** Active ms when the work ended, or null while it runs. */
  endedAt: number | null;
  ended: 'finished' | 'capped' | 'ended_early' | null;
}

export const NEW_RUNNER: RunnerState = { startedAt: null, pausedAt: null, pausedMs: 0, laps: [], lastLapWall: null, endedAt: null, ended: null };

export type RunnerEvent =
  | { type: 'start'; at: number }
  | { type: 'pause'; at: number }
  | { type: 'resume'; at: number }
  | { type: 'lap'; at: number }
  | { type: 'undo'; at: number }
  /** The big Done for "for time", the last segment's Done, or End early from the menu. */
  | { type: 'finish'; at: number; early?: boolean };

/** Active ms at wall time `now` (negative during the lead-in). */
export function activeMs(spec: RunnerSpec, s: RunnerState, now: number): number {
  if (s.startedAt == null) return -spec.leadInSec * 1000;
  const paused = s.pausedMs + (s.pausedAt != null ? Math.max(0, now - s.pausedAt) : 0);
  return now - s.startedAt - paused - spec.leadInSec * 1000;
}

/** Where the clock-bound kinds end on their own (countdown or windows), in active ms; null when open-ended. */
function naturalEnd(spec: RunnerSpec): number | null {
  if (spec.mode === 'countdown' || spec.mode === 'windows') return spec.totalSec != null ? spec.totalSec * 1000 : null;
  return null;
}

/**
 * Apply time passing: a countdown or the last window ends by itself, a cap stops "for time". Call it with every
 * reading you store; `runnerView` already reports these as done.
 */
export function settle(spec: RunnerSpec, s: RunnerState, now: number): RunnerState {
  if (s.startedAt == null || s.ended) return s;
  const t = activeMs(spec, s, now);
  const end = naturalEnd(spec);
  if (end != null && t >= end) return { ...s, pausedAt: null, endedAt: end, ended: 'finished' };
  if (spec.mode === 'up' && spec.totalSec != null && t >= spec.totalSec * 1000) return { ...s, pausedAt: null, endedAt: spec.totalSec * 1000, ended: 'capped' };
  return s;
}

export function runnerReduce(spec: RunnerSpec, state: RunnerState, e: RunnerEvent): RunnerState {
  const s = settle(spec, state, e.at);
  switch (e.type) {
    case 'start':
      return s.startedAt == null ? { ...s, startedAt: e.at } : s;
    case 'pause':
      return s.startedAt != null && s.pausedAt == null && !s.ended ? { ...s, pausedAt: e.at } : s;
    case 'resume':
      return s.pausedAt != null ? { ...s, pausedMs: s.pausedMs + (e.at - s.pausedAt), pausedAt: null } : s;
    case 'lap': {
      const v = runnerView(spec, s, e.at);
      if (!v.canLap) return s;
      const t = Math.max(0, activeMs(spec, s, e.at));
      const laps = [...s.laps, t];
      // The last segment (race sim) or the last distance rep ends the work.
      const last = (spec.mode === 'segments' || spec.mode === 'intervals') && spec.rounds != null && laps.length >= spec.rounds;
      return last ? { ...s, laps, lastLapWall: e.at, endedAt: t, ended: 'finished', pausedAt: null } : { ...s, laps, lastLapWall: e.at };
    }
    case 'undo': {
      if (!runnerView(spec, s, e.at).canUndo) return s;
      const laps = s.laps.slice(0, -1);
      const reopened = s.ended && (spec.mode === 'segments' || spec.mode === 'intervals');
      // Reopening the last segment: the time since it ended counts again, as if Done hadn't been tapped.
      return { ...s, laps, lastLapWall: null, ...(reopened ? { endedAt: null, ended: null } : {}) };
    }
    case 'finish': {
      if (s.ended || s.startedAt == null) return s;
      const t = Math.max(0, activeMs(spec, s, e.at));
      return { ...s, pausedAt: null, endedAt: t, ended: e.early ? 'ended_early' : 'finished' };
    }
  }
}

/* ---------- reading the clock ---------- */

export type RunnerPhase = 'ready' | 'lead_in' | 'work' | 'rest' | 'paused' | 'done';

export interface RunnerView {
  phase: RunnerPhase;
  /** What the big numerals show, in whole seconds. */
  clockSec: number;
  direction: 'up' | 'down';
  /** Active seconds since the work started (whole session of this block). */
  elapsedSec: number;
  /** Current round / window / rep / segment, 1-based (the next one during rest). */
  index: number;
  of: number | null;
  /** Laps counted (rounds tapped, reps or segments done). */
  laps: number;
  /** Seconds left before the cap, when there is one. */
  capLeftSec: number | null;
  canLap: boolean;
  canUndo: boolean;
  ended: RunnerState['ended'];
}

const floorS = (ms: number) => Math.max(0, Math.floor(ms / 1000));
const ceilS = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

export function runnerView(spec: RunnerSpec, state: RunnerState, now: number): RunnerView {
  const s = settle(spec, state, now);
  const t = s.endedAt ?? activeMs(spec, s, now);
  const of = spec.rounds;
  const base = { of, laps: s.laps.length, ended: s.ended, capLeftSec: null as number | null };
  const undoable =
    s.laps.length > 0 &&
    (spec.lap === 'round' ? !s.ended || spec.mode === 'up' || spec.mode === 'countdown' || spec.mode === 'windows' : s.lastLapWall != null && now - s.lastLapWall <= UNDO_WINDOW_SEC * 1000);

  if (s.startedAt == null) {
    const clock = spec.mode === 'countdown' ? spec.totalSec ?? 0 : spec.mode === 'windows' ? spec.workSec ?? 0 : 0;
    return { ...base, phase: 'ready', clockSec: clock, direction: spec.mode === 'countdown' || spec.mode === 'windows' ? 'down' : 'up', elapsedSec: 0, index: 1, canLap: false, canUndo: false };
  }
  if (!s.ended && t < 0) {
    return { ...base, phase: s.pausedAt != null ? 'paused' : 'lead_in', clockSec: ceilS(-t), direction: 'down', elapsedSec: 0, index: 1, canLap: false, canUndo: false };
  }
  const paused = s.pausedAt != null && !s.ended;
  const done = !!s.ended;
  const live = (phase: RunnerPhase): RunnerPhase => (done ? 'done' : paused ? 'paused' : phase);

  switch (spec.mode) {
    case 'countdown': {
      const total = (spec.totalSec ?? 0) * 1000;
      return { ...base, phase: live('work'), clockSec: ceilS(total - t), direction: 'down', elapsedSec: floorS(t), index: s.laps.length + 1, canLap: !done && !paused && spec.lap != null, canUndo: undoable };
    }
    case 'up': {
      const cap = spec.totalSec != null ? spec.totalSec * 1000 : null;
      return {
        ...base,
        capLeftSec: cap != null ? ceilS(cap - t) : null,
        phase: live('work'),
        clockSec: floorS(t),
        direction: 'up',
        elapsedSec: floorS(t),
        index: Math.min(s.laps.length + 1, of ?? Infinity),
        canLap: !done && !paused && spec.lap != null && (of == null || s.laps.length < of - 1),
        canUndo: undoable,
      };
    }
    case 'windows': {
      const work = (spec.workSec ?? 0) * 1000;
      const period = work + spec.restSec * 1000;
      const rounds = spec.rounds ?? 1;
      const i = Math.min(rounds - 1, Math.floor(t / period));
      const within = t - i * period;
      const resting = within >= work && i < rounds - 1;
      return {
        ...base,
        phase: live(resting ? 'rest' : 'work'),
        clockSec: done ? 0 : resting ? ceilS(period - within) : ceilS(work - within),
        direction: 'down',
        elapsedSec: floorS(t),
        index: resting ? i + 2 : i + 1,
        canLap: !done && !paused && spec.lap != null && !resting,
        canUndo: undoable,
      };
    }
    case 'intervals': {
      const k = s.laps.length;
      const restMs = spec.restSec * 1000;
      const startK = k === 0 ? 0 : s.laps[k - 1]! + restMs;
      const resting = !done && k > 0 && t < startK;
      return {
        ...base,
        phase: live(resting ? 'rest' : 'work'),
        clockSec: done ? floorS(s.laps.at(-1)! - (k > 1 ? s.laps[k - 2]! + restMs : 0)) : resting ? ceilS(startK - t) : floorS(t - startK),
        direction: resting ? 'down' : 'up',
        elapsedSec: floorS(t),
        index: Math.min(k + 1, of ?? Infinity),
        canLap: !done && !paused && !resting,
        canUndo: undoable,
      };
    }
    case 'segments': {
      const k = s.laps.length;
      const startK = k === 0 ? 0 : s.laps[k - 1]!;
      return {
        ...base,
        phase: live('work'),
        clockSec: done ? floorS(t) : floorS(t - startK),
        direction: 'up',
        elapsedSec: floorS(t),
        index: Math.min(k + 1, of ?? Infinity),
        canLap: !done && !paused,
        canUndo: undoable,
      };
    }
  }
}

/* ---------- results ---------- */

/** Splits from the laps: rounds (AMRAP, RFT), interval reps (work only) or race segments. */
export function runnerSplits(spec: RunnerSpec, s: RunnerState, label = 'Rep'): BlockSplit[] {
  const sec = (ms: number) => Math.round(ms / 100) / 10;
  const split = (kind: BlockSplit['kind'], name: string, index: number, ms: number, distanceM: number | null = null): BlockSplit => ({ kind, name, index, sec: Math.min(7200, sec(ms)), distanceM, avgHr: null, maxHr: null });
  if (spec.mode === 'segments')
    return s.laps.map((at, i) => {
      const seg = spec.segments[i]!;
      return split(seg.kind === 'run' ? 'run' : 'station', seg.name.slice(0, 60), i, at - (i ? s.laps[i - 1]! : 0), seg.distanceM);
    });
  if (spec.mode === 'intervals')
    return s.laps.map((at, i) => split('interval', `${label} ${i + 1}`.slice(0, 60), i, at - (i ? s.laps[i - 1]! + spec.restSec * 1000 : 0), spec.distanceM));
  if (spec.mode === 'windows' && spec.lap == null) {
    // Time-based reps: each finished window counts its full work time.
    const done = s.endedAt == null ? 0 : Math.min(spec.rounds ?? 0, Math.ceil(s.endedAt / (((spec.workSec ?? 0) + spec.restSec) * 1000) - 1e-9));
    if (s.ended !== 'finished') return [];
    return Array.from({ length: done }, (_, i) => split('interval', `${label} ${i + 1}`.slice(0, 60), i, (spec.workSec ?? 0) * 1000));
  }
  const rounds = s.laps.map((at, i) => split('round', `Round ${i + 1}`, i, at - (i ? s.laps[i - 1]! : 0)));
  // For time with rounds: "Done" ends the last round, so it gets its split too.
  if (spec.mode === 'up' && spec.lap === 'round' && s.ended === 'finished' && s.endedAt != null && spec.rounds != null && s.laps.length < spec.rounds) {
    const from = s.laps.at(-1) ?? 0;
    if (s.endedAt > from) rounds.push(split('round', `Round ${s.laps.length + 1}`, s.laps.length, s.endedAt - from));
  }
  return rounds;
}

/** The score the runner already knows, to prefill score entry. The client can change any of it. */
export function runnerScore(b: Block, spec: RunnerSpec, s: RunnerState): BlockScore {
  const out: BlockScore = { ...EMPTY_SCORE };
  const sec = s.endedAt != null ? Math.round(s.endedAt / 1000) : null;
  switch (b.scoring) {
    case 'time':
      if (s.ended === 'capped') return { ...out, capped: true, rounds: spec.lap === 'round' ? s.laps.length : null, reps: spec.lap === 'round' ? null : 0 };
      if (spec.mode === 'intervals' || spec.mode === 'windows') {
        const splits = runnerSplits(spec, s);
        return { ...out, timeSec: Math.round(splits.reduce((a, x) => a + x.sec, 0)), distanceM: spec.distanceM != null ? spec.distanceM * splits.length : null };
      }
      return { ...out, timeSec: sec };
    case 'rounds_reps':
      return { ...out, rounds: s.laps.length, reps: 0 };
    case 'distance':
      return { ...out, distanceM: spec.distanceM != null ? spec.distanceM * s.laps.length : null };
    default:
      return { ...out, timeSec: sec };
  }
}
