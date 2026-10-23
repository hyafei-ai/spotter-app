import { HYROX_STATIONS } from './templates/raceSims';

/**
 * Race-format analytics (docs/ports.md row 4): time entry and display, pacing, fade, roxzone (transition) time,
 * each station against the athlete's own best, which workouts count as a simulation, and a new measure of
 * compromised running. Everything compares the athlete with themselves: no population norms.
 *
 * Ported from Station Zero's pacingAnalysis.ts, hyroxCalculations.ts (time parse/format only),
 * raceReadiness.ts (isHyroxSimulation) and the compare-races screen's logic. Fixed rather than copied:
 * - parseTimeInput rejected "1:02:03" although formatRaceTime writes that form, and read "5m" as 5 seconds.
 * - formatRaceTime could print "1:60" (seconds rounded up to 60 without carrying).
 * - Pacing quarters were uneven for split counts not divisible by 4 (six splits gave quarters of 1, 1, 1, 3).
 * - The never-produced INCONSISTENT pacing pattern is gone.
 * - The compare screen added a fixed "median race roxzone" of 7:00 to simulations; that population number is not
 *   ported. Roxzone is the athlete's own, recorded or derived.
 * Not ported: sRPE bands and ACWR zones (the bands had no source; Spotter's load trend is in signals.ts).
 */

const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/* ---------- time entry and display ---------- */

/**
 * A typed time → seconds, or null when it can't be read.
 * "4:05" → 245, "1:02:03" → 3723, "4.05" → 245 (a dot is a separator), "405" → 245, "10203" → 3723,
 * "45" → 45 s, "45s" → 45, "5m" → 300, "1h 5m 3s" → 3903. Seconds or minutes of 60 or more after a separator are
 * rejected ("4:75").
 */
export function parseTimeInput(input: string | null | undefined): number | null {
  const raw = (input ?? '').trim().toLowerCase();
  if (!raw) return null;

  // Unit form: "1h 5m 3s", "5m", "45s", "90 sec", "2 min".
  const units = raw.match(
    /^(?:(\d+)\s*h(?:rs?|ours?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+)\s*s(?:ec(?:ond)?s?)?)?$/,
  );
  if (units && (units[1] || units[2] || units[3])) {
    return Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0);
  }

  const s = raw.replace(/\./g, ':');
  if (s.includes(':')) {
    const parts = s.split(':');
    if (parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
    const n = parts.map(Number);
    if (n.slice(1).some((x) => x >= 60)) return null;
    return n.length === 3 ? n[0]! * 3600 + n[1]! * 60 + n[2]! : n[0]! * 60 + n[1]!;
  }
  if (!/^\d+$/.test(s)) return null;
  if (s.length <= 2) return Number(s);
  const sec = Number(s.slice(-2));
  if (sec >= 60) return null;
  if (s.length <= 4) return Number(s.slice(0, -2)) * 60 + sec;
  if (s.length <= 6) {
    const min = Number(s.slice(-4, -2));
    if (min >= 60) return null;
    return Number(s.slice(0, -4)) * 3600 + min * 60 + sec;
  }
  return null;
}

/** Seconds → "1:05:03" or "4:05". "—" when there's no time. */
export function formatRaceTime(totalSec: number | null | undefined): string {
  if (totalSec == null || !Number.isFinite(totalSec) || totalSec <= 0) return '—';
  const t = Math.round(totalSec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/** "+0:12" slower, "−0:12" faster. */
export function formatTimeDelta(deltaSec: number): string {
  if (Math.round(deltaSec) === 0) return '0:00';
  return `${deltaSec > 0 ? '+' : '−'}${formatRaceTime(Math.abs(deltaSec))}`;
}

/* ---------- pacing ---------- */

/**
 * Halves within this many percent of each other read as even. A display threshold so a few seconds' wobble isn't
 * called a fade, not a statistic about athletes.
 */
export const EVEN_SPLIT_PCT = 5;

export type PacingPattern = 'even' | 'positive' | 'negative';

export interface PacingAnalysis {
  pattern: PacingPattern;
  /** Second-half average vs first-half average, %. Positive = slower in the second half. */
  fadePct: number;
  /** Average split in each quarter, seconds. */
  quarterAvgSec: [number, number, number, number];
  fastestQuarter: 1 | 2 | 3 | 4;
  slowestQuarter: 1 | 2 | 3 | 4;
}

/** Four near-equal chunks: 6 splits → 2, 1, 2, 1 rather than 1, 1, 1, 3. */
function quarters(xs: number[]): number[][] {
  return [0, 1, 2, 3].map((q) =>
    xs.slice(Math.round((q * xs.length) / 4), Math.round(((q + 1) * xs.length) / 4)),
  );
}

/** Pacing across splits (runs, stations or intervals). Needs 4 timed splits. */
export function pacingAnalysis(splitsSec: number[]): PacingAnalysis | null {
  const xs = splitsSec.filter((x) => Number.isFinite(x) && x > 0);
  if (xs.length < 4) return null;
  const mid = Math.floor(xs.length / 2);
  const first = mean(xs.slice(0, mid));
  const second = mean(xs.slice(mid));
  const fade = ((second - first) / first) * 100;
  const pattern: PacingPattern =
    Math.abs(fade) < EVEN_SPLIT_PCT ? 'even' : fade > 0 ? 'positive' : 'negative';
  const q = quarters(xs).map((c) => r1(mean(c))) as [number, number, number, number];
  const fastest = q.indexOf(Math.min(...q));
  const slowest = q.indexOf(Math.max(...q));
  return {
    pattern,
    fadePct: r1(fade),
    quarterAvgSec: q,
    fastestQuarter: (fastest + 1) as 1 | 2 | 3 | 4,
    slowestQuarter: (slowest + 1) as 1 | 2 | 3 | 4,
  };
}

/** One plain line about pacing, to the athlete. */
export function pacingLine(a: PacingAnalysis): string {
  const pct = Math.abs(Math.round(a.fadePct));
  if (a.pattern === 'even')
    return `Even pace: the second half was within ${EVEN_SPLIT_PCT}% of the first`;
  if (a.pattern === 'positive') return `Slowed ${pct}% in the second half`;
  return `${pct}% faster in the second half`;
}

/**
 * Fade index: the last half of the runs against the first half, % slower (negative = faster). Needs 6 runs; with
 * an odd number the middle run is left out. Source: the compare-races screen.
 */
export function fadeIndex(runSec: number[]): number | null {
  const xs = runSec.filter((x) => Number.isFinite(x) && x > 0);
  if (xs.length < 6) return null;
  const half = Math.floor(xs.length / 2);
  return r1((mean(xs.slice(-half)) / mean(xs.slice(0, half)) - 1) * 100);
}

/* ---------- roxzone ---------- */

export interface Roxzone {
  sec: number;
  /** "recorded": transition times were logged. "derived": total minus runs minus stations. */
  source: 'recorded' | 'derived';
}

/**
 * Time spent between runs and stations. Uses logged transitions when there are any, else the finish time minus
 * every run and station (only when all are present, so a missing split isn't counted as transition time).
 */
export function roxzone(input: {
  totalSec?: number | null;
  runSec: number[];
  stationSec: number[];
  transitionSec?: number[] | null;
  expectedSplits?: number;
}): Roxzone | null {
  const logged = (input.transitionSec ?? []).filter((x) => Number.isFinite(x) && x > 0);
  if (logged.length)
    return { sec: Math.round(logged.reduce((a, b) => a + b, 0)), source: 'recorded' };
  const expected = input.expectedSplits ?? 8;
  const ok = (xs: number[]) =>
    xs.length >= expected && xs.every((x) => Number.isFinite(x) && x > 0);
  if (input.totalSec == null || !ok(input.runSec) || !ok(input.stationSec)) return null;
  const rest =
    input.totalSec -
    input.runSec.reduce((a, b) => a + b, 0) -
    input.stationSec.reduce((a, b) => a + b, 0);
  return rest > 0 ? { sec: Math.round(rest), source: 'derived' } : null;
}

/* ---------- each station against the athlete's own best ---------- */

export interface StationSplit {
  station: string;
  sec: number;
}

export interface StationVsBest {
  station: string;
  sec: number;
  /** Best earlier time at this station, or null for a first time. */
  bestSec: number | null;
  bestDate: string | null;
  /** This time minus the earlier best: positive = slower. */
  deltaSec: number | null;
  /** Faster than every earlier time at this station. */
  isBest: boolean;
}

/** Each station in this result against the athlete's best earlier time at that station. */
export function stationsVsBest(
  current: StationSplit[],
  history: { date: string; stations: StationSplit[] }[],
): StationVsBest[] {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  return current
    .filter((s) => Number.isFinite(s.sec) && s.sec > 0)
    .map((s) => {
      let best: { sec: number; date: string } | null = null;
      for (const h of history)
        for (const x of h.stations)
          if (key(x.station) === key(s.station) && x.sec > 0 && (!best || x.sec < best.sec))
            best = { sec: x.sec, date: h.date };
      return {
        station: s.station,
        sec: s.sec,
        bestSec: best?.sec ?? null,
        bestDate: best?.date ?? null,
        deltaSec: best ? Math.round(s.sec - best.sec) : null,
        isBest: !best || s.sec < best.sec,
      };
    });
}

/** "Sled Push 3:05, a new best" / "Sled Push 3:05, 12 s off your best (2:53)". */
export function stationVsBestLine(x: StationVsBest): string {
  const t = `${x.station} ${formatRaceTime(x.sec)}`;
  if (x.bestSec == null) return `${t}, your first time logged`;
  if (x.isBest) return `${t}, a new best by ${Math.round(x.bestSec - x.sec)} s`;
  if (x.deltaSec === 0) return `${t}, equal to your best`;
  return `${t}, ${x.deltaSec} s off your best (${formatRaceTime(x.bestSec)})`;
}

/* ---------- which workouts count as a simulation ---------- */

/**
 * Plausibility gate for race-format durations, so a test tap or an abandoned timer doesn't become a best: full
 * 30 min to 3 h, half 15 min to 90 min. Wide on purpose; it removes impossible entries, it doesn't judge.
 */
export function isPlausibleSimDuration(sec: number | null | undefined, half = false): boolean {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return false;
  return half ? sec >= 15 * 60 && sec <= 90 * 60 : sec >= 30 * 60 && sec <= 3 * 3600;
}

/**
 * A logged workout is a race simulation when it was built as one (`kind: 'race_sim'`, or a parsed format of
 * "hyrox"), or its name says both "hyrox" and sim/simulation/full/half; and its duration passes the gate.
 * "Hyrox skills" or "Hyrox strength" is training, not a simulation.
 */
export function isHyroxSimulation(w: {
  name?: string | null;
  kind?: string | null;
  format?: string | null;
  durationSec?: number | null;
}): boolean {
  const name = (w.name ?? '').toLowerCase();
  const half = /\bhalf\b/.test(name);
  if (w.kind === 'race_sim' || w.format === 'hyrox')
    return isPlausibleSimDuration(w.durationSec, half);
  if (!name.includes('hyrox')) return false;
  if (!(/\bsim(?:ulation)?\b/.test(name) || /\bfull\b/.test(name) || half)) return false;
  return isPlausibleSimDuration(w.durationSec, half);
}

/* ---------- compromised running (new) ---------- */

/**
 * How much running slows after each station: the "compromised running" a race-format athlete trains for.
 * Each run after the first is attributed to the station just before it (run 2 follows the first station, and so
 * on). Two comparisons, both against the athlete themselves:
 * - against their first run of the same session;
 * - against their fresh 1 km benchmark, when one is known (a recent 1 km time trial, entered by the coach).
 * Pace is per km, so runs of different distances compare fairly.
 */
export const COMPROMISED_MIN_DROP_PCT = 3;

export interface CompromisedRun {
  /** 1-based. */
  run: number;
  sec: number;
  paceSecPerKm: number;
  /** % slower than run 1 (negative = faster). Null for run 1. */
  vsFirstPct: number | null;
  /** % slower than the fresh 1 km benchmark, or null when there isn't one. */
  vsFreshPct: number | null;
  /** The station run before this run, or null for run 1. */
  after: string | null;
}

export interface CompromisedRunning {
  runs: CompromisedRun[];
  /** The run that slowed most against run 1, or null when none did by COMPROMISED_MIN_DROP_PCT. */
  worst: CompromisedRun | null;
  /** To the athlete. */
  lines: string[];
  /** To the coach, pronoun-free. */
  coachLines: string[];
}

export interface CompromisedInput {
  runSec: number[];
  /** Metres per run: one number for all, or one per run. Default 1000. */
  runDistanceM?: number | number[];
  /** Station before each run from run 2 on; default the race order. */
  stations?: readonly string[];
}

function runsOf(input: CompromisedInput, freshKmSec: number | null): CompromisedRun[] | null {
  const stations = input.stations ?? HYROX_STATIONS;
  const dist = (i: number) =>
    (Array.isArray(input.runDistanceM) ? input.runDistanceM[i] : input.runDistanceM) ?? 1000;
  const xs = input.runSec;
  if (
    xs.length < 2 ||
    xs.some((x) => !Number.isFinite(x) || x <= 0) ||
    xs.some((_, i) => !(dist(i) > 0))
  )
    return null;
  const paces = xs.map((x, i) => x / (dist(i) / 1000));
  const fresh = freshKmSec != null && freshKmSec > 0 ? freshKmSec : null;
  return xs.map((sec, i) => ({
    run: i + 1,
    sec,
    paceSecPerKm: r1(paces[i]!),
    vsFirstPct: i === 0 ? null : r1((paces[i]! / paces[0]! - 1) * 100),
    vsFreshPct: fresh ? r1((paces[i]! / fresh - 1) * 100) : null,
    after: i === 0 ? null : (stations[i - 1] ?? null),
  }));
}

/** Station names inside a sentence: "after sled push", "after the SkiErg". */
const IN_SENTENCE: Record<string, string> = {
  SkiErg: 'the SkiErg',
  'Sled Push': 'sled push',
  'Sled Pull': 'sled pull',
  'Burpee Broad Jump': 'burpee broad jumps',
  Rowing: 'the row',
  'Farmers Carry': 'farmers carry',
  'Sandbag Lunges': 'sandbag lunges',
  'Wall Balls': 'wall balls',
};
const lower = (s: string) => IN_SENTENCE[s] ?? (/[a-z][A-Z]/.test(s) ? s : s.toLowerCase());

/** One session's runs. Null without at least two timed runs. */
export function compromisedRunning(
  input: CompromisedInput,
  freshKmSec: number | null = null,
): CompromisedRunning | null {
  const runs = runsOf(input, freshKmSec);
  if (!runs) return null;
  const later = runs.filter((r) => r.vsFirstPct != null && r.after != null);
  const top = later.reduce<CompromisedRun | null>(
    (a, r) => (!a || r.vsFirstPct! > a.vsFirstPct! ? r : a),
    null,
  );
  const worst = top && top.vsFirstPct! >= COMPROMISED_MIN_DROP_PCT ? top : null;
  const lines: string[] = [];
  const coachLines: string[] = [];
  if (worst) {
    const pct = Math.round(worst.vsFirstPct!);
    lines.push(
      `Running pace drops most after ${lower(worst.after!)}: ${pct}% slower than your first run`,
    );
    coachLines.push(
      `Running pace drops most after ${lower(worst.after!)}: ${pct}% slower than their first run`,
    );
  } else {
    lines.push(`Every run stayed within ${COMPROMISED_MIN_DROP_PCT}% of your first run's pace`);
    coachLines.push(
      `Every run stayed within ${COMPROMISED_MIN_DROP_PCT}% of their first run's pace`,
    );
  }
  const fresh = freshKmSec != null && freshKmSec > 0 ? freshKmSec : null;
  if (fresh) {
    const avg = Math.round(mean(runs.map((r) => r.vsFreshPct!)));
    const f = formatRaceTime(fresh);
    const words = avg >= 0 ? `${avg}% slower than` : `${-avg}% faster than`;
    lines.push(`Across the race, runs averaged ${words} your fresh 1 km (${f})`);
    coachLines.push(`Runs averaged ${words} their fresh 1 km (${f})`);
  }
  return { runs, worst, lines, coachLines };
}

export interface StationRunCost {
  station: string;
  /** Mean % slower than run 1 for the run after this station. */
  avgVsFirstPct: number;
  /** Mean % slower than the fresh 1 km, or null. */
  avgVsFreshPct: number | null;
  /** Sessions with a run after this station. */
  sessions: number;
  /** Sessions where the run after this station slowed the most. */
  worstIn: number;
}

/**
 * Across several sessions: which station costs the run after it most, on average, with counts.
 * "Running pace drops most after sled push: 12% slower than your first run on average across 4 simulations
 * (the biggest drop in 3 of them)". Needs 2 sessions; one session reads with compromisedRunning.
 */
export function compromisedRunningAcross(
  sessions: CompromisedInput[],
  freshKmSec: number | null = null,
  noun = 'simulations',
): { byStation: StationRunCost[]; lines: string[]; coachLines: string[] } | null {
  const each = sessions
    .map((s) => runsOf(s, freshKmSec))
    .filter((r): r is CompromisedRun[] => r != null);
  if (each.length < 2) return null;
  const by = new Map<string, { first: number[]; fresh: number[]; worstIn: number }>();
  for (const runs of each) {
    const later = runs.filter((r) => r.after != null && r.vsFirstPct != null);
    const top = later.reduce<CompromisedRun | null>(
      (a, r) => (!a || r.vsFirstPct! > a.vsFirstPct! ? r : a),
      null,
    );
    for (const r of later) {
      const e = by.get(r.after!) ?? { first: [], fresh: [], worstIn: 0 };
      e.first.push(r.vsFirstPct!);
      if (r.vsFreshPct != null) e.fresh.push(r.vsFreshPct);
      if (r === top && r.vsFirstPct! >= COMPROMISED_MIN_DROP_PCT) e.worstIn++;
      by.set(r.after!, e);
    }
  }
  const byStation: StationRunCost[] = [...by.entries()]
    .map(([station, e]) => ({
      station,
      avgVsFirstPct: r1(mean(e.first)),
      avgVsFreshPct: e.fresh.length ? r1(mean(e.fresh)) : null,
      sessions: e.first.length,
      worstIn: e.worstIn,
    }))
    .sort((a, b) => b.avgVsFirstPct - a.avgVsFirstPct);
  const top = byStation[0]!;
  const lines: string[] = [];
  const coachLines: string[] = [];
  if (top.avgVsFirstPct >= COMPROMISED_MIN_DROP_PCT) {
    const pct = Math.round(top.avgVsFirstPct);
    const tail = `on average across ${top.sessions} ${noun}${top.worstIn ? ` (the biggest drop in ${top.worstIn} of them)` : ''}`;
    lines.push(
      `Running pace drops most after ${lower(top.station)}: ${pct}% slower than your first run ${tail}`,
    );
    coachLines.push(
      `Running pace drops most after ${lower(top.station)}: ${pct}% slower than their first run ${tail}`,
    );
  } else {
    lines.push(
      `Across ${each.length} ${noun}, every run stayed within ${COMPROMISED_MIN_DROP_PCT}% of your first run's pace on average`,
    );
    coachLines.push(
      `Across ${each.length} ${noun}, every run stayed within ${COMPROMISED_MIN_DROP_PCT}% of their first run's pace on average`,
    );
  }
  return { byStation, lines, coachLines };
}
