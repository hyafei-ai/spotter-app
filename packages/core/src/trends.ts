import { averagePace, distanceText, scoreText, scoreValue } from './blocks';
import { compromisedRunningAcross, formatRaceTime, stationsVsBest, type CompromisedInput } from './hyrox';
import type { BlockKind, BlockResult, BlockSplit, ScoringMode } from './schemas';
import type { WeightUnit } from './units';

/**
 * Results over time for scored blocks (docs/ports.md row 7): benchmark and interval histories, movement and station
 * trends (ported in idea from Station Zero's movementTrends.ts: each movement against the athlete's own earlier
 * sessions, never a population norm, with the number of sessions on every claim), and the station that costs most
 * (bottleneck: furthest off the athlete's own best, and the run after it).
 */

const r1 = (n: number) => Math.round(n * 10) / 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A session's scored blocks, with its date. */
export interface ScoredSession {
  date: string;
  results: Pick<BlockResult, 'key' | 'label' | 'kind' | 'scoring' | 'score' | 'splits'>[];
}

/* ---------- score history per piece of work ---------- */

export interface ScoreEntry {
  date: string;
  value: number;
  text: string;
  /** Interval work with a distance: average pace in s/km, compared instead of total time. */
  paceSecPerKm?: number | null;
}

export interface ScoreHistory {
  key: string;
  label: string;
  kind: BlockKind;
  scoring: ScoringMode;
  entries: ScoreEntry[];
  latest: ScoreEntry;
  best: ScoreEntry;
  /** "Fran · 4:12 · best 4:05 · 3rd time" pieces. */
  line: string;
  /** A sentence only with 3+ results: "6 s faster than your first, across 4 times". */
  trend: string | null;
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/**
 * Every repeated (or single) scored piece of work, most recently done first. Values compare only within a key
 * (blocks.ts blockKey), and only when the scoring mode is the same.
 */
export function scoreHistories(sessions: ScoredSession[], unit: WeightUnit = 'kg', audience: 'client' | 'coach' = 'client'): ScoreHistory[] {
  const your = audience === 'client' ? 'your' : 'the';
  const by = new Map<string, { label: string; kind: BlockKind; scoring: ScoringMode; entries: ScoreEntry[] }>();
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const r of s.results) {
      if (r.scoring === 'none') continue;
      const v = scoreValue(r);
      if (v == null) continue;
      const k = `${r.key}|${r.scoring}`;
      const cur = by.get(k) ?? { label: r.label, kind: r.kind, scoring: r.scoring, entries: [] };
      const pace = r.kind === 'intervals' ? averagePace(r.splits) : null;
      cur.entries.push({ date: s.date, value: v, text: scoreText(r, unit), ...(pace != null ? { paceSecPerKm: pace } : {}) });
      cur.label = r.label;
      by.set(k, cur);
    }
  }
  const out: ScoreHistory[] = [];
  for (const [k, h] of by) {
    const latest = h.entries.at(-1)!;
    const best = h.entries.reduce((a, e) => (e.value > a.value ? e : a));
    const n = h.entries.length;
    const parts = [h.label, latest.text];
    if (n === 1) parts.push('first time logged');
    else {
      if (best !== latest) parts.push(`best ${best.text}`);
      else parts.push(audience === 'client' ? 'your best' : 'best yet');
      parts.push(`${ordinal(n)} time`);
    }
    out.push({ key: k.split('|')[0]!, label: h.label, kind: h.kind, scoring: h.scoring, entries: h.entries, latest, best, line: parts.join(' · '), trend: n >= 3 ? trendSentence(h.scoring, h.entries, your) : null });
  }
  return out.sort((a, b) => b.latest.date.localeCompare(a.latest.date));
}

function trendSentence(scoring: ScoringMode, e: ScoreEntry[], your = 'your'): string {
  const first = e[0]!;
  const last = e.at(-1)!;
  const d = last.value - first.value;
  const times = `across ${plural(e.length, 'time')}`;
  if (d === 0) return `${your === 'your' ? 'The same as your' : 'The same as the'} first, ${times}`;
  if (first.paceSecPerKm != null && last.paceSecPerKm != null) {
    const dp = Math.round(first.paceSecPerKm - last.paceSecPerKm);
    if (dp === 0) return `The same pace as ${your} first, ${times}`;
    return `${Math.abs(dp)} s per km ${dp > 0 ? 'faster' : 'slower'} than ${your} first, ${times}`;
  }
  switch (scoring) {
    case 'time': {
      // Values are −seconds; capped results sit far below and aren't turned into a seconds difference.
      if (first.value < -1e6 || last.value < -1e6) return d > 0 ? `Better than ${your} first, ${times}` : `Not as quick as ${your} first, ${times}`;
      return `${formatRaceTime(Math.abs(d))} ${d > 0 ? 'faster' : 'slower'} than ${your} first, ${times}`;
    }
    case 'rounds_reps': {
      const rounds = Math.trunc(d / 1000);
      const reps = d - rounds * 1000;
      const what = rounds ? plural(Math.abs(rounds), 'round') : `${Math.abs(reps)} reps`;
      return `${what} ${d > 0 ? 'more' : 'fewer'} than ${your} first, ${times}`;
    }
    default:
      return `${d > 0 ? 'Up' : 'Down'} ${Math.round(Math.abs(d / (first.value || 1)) * 100)}% on ${your} first, ${times}`;
  }
}

/* ---------- movement and station trends (port of movementTrends.ts) ---------- */

export interface MovementTrend {
  name: string;
  kind: BlockSplit['kind'];
  /** Latest pace: s/km for distance work of 150 m or more, else seconds for the split. */
  latest: number;
  priorAvg: number;
  /** (latest − prior) / prior, %. Negative = faster. */
  deltaPct: number;
  /** Earlier sessions compared (2–7). */
  priorSessions: number;
  unit: 's/km' | 's';
  /** "Sled push 3:05, 4% faster than your last 5 sessions (3:13)". */
  line: string;
}

const MAX_PRIOR = 7;
const keyOf = (name: string) => name.toLowerCase().replace(/^run \d+$/, 'run').replace(/[^a-z]+/g, ' ').trim();

/**
 * For each run, interval or station name in the latest session that has at least two earlier sessions with the same
 * name: the latest pace against the mean of up to the 7 sessions before. Per session, repeats of a name are averaged.
 */
export function movementTrends(sessions: { date: string; splits: Pick<BlockSplit, 'kind' | 'name' | 'sec' | 'distanceM'>[] }[]): MovementTrend[] {
  const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted.at(-1);
  if (!latest) return [];
  const pace = (x: Pick<BlockSplit, 'sec' | 'distanceM'>) => (x.distanceM != null && x.distanceM >= 150 ? { v: (x.sec / x.distanceM) * 1000, unit: 's/km' as const } : { v: x.sec, unit: 's' as const });
  const perSession = (s: (typeof sorted)[number], k: string) => {
    const xs = s.splits.filter((x) => keyOf(x.name) === k && x.sec > 0).map(pace);
    if (!xs.length || xs.some((x) => x.unit !== xs[0]!.unit)) return null;
    return { v: mean(xs.map((x) => x.v)), unit: xs[0]!.unit };
  };
  const names = [...new Map(latest.splits.map((x) => [keyOf(x.name), x] as const)).values()];
  const out: MovementTrend[] = [];
  for (const x of names) {
    const k = keyOf(x.name);
    const now = perSession(latest, k);
    if (!now) continue;
    const prior = sorted
      .slice(0, -1)
      .map((s) => perSession(s, k))
      .filter((p): p is NonNullable<typeof p> => p != null && p.unit === now.unit)
      .slice(-MAX_PRIOR);
    if (prior.length < 2) continue;
    const avg = mean(prior.map((p) => p.v));
    const deltaPct = r1(((now.v - avg) / avg) * 100);
    const show = (v: number) => (now.unit === 's/km' ? `${formatRaceTime(v)}/km` : formatRaceTime(v));
    const name = x.kind === 'run' ? 'Runs' : x.name;
    const dir = Math.abs(deltaPct) < 1 ? 'about the same as' : deltaPct < 0 ? `${Math.abs(Math.round(deltaPct))}% faster than` : `${Math.round(deltaPct)}% slower than`;
    out.push({ name, kind: x.kind, latest: r1(now.v), priorAvg: r1(avg), deltaPct, priorSessions: prior.length, unit: now.unit, line: `${name} ${show(now.v)}, ${dir} your last ${plural(prior.length, 'session')} (${show(avg)})` });
  }
  return out;
}

/* ---------- race simulations: the bottleneck station ---------- */

export interface RaceSimResult {
  date: string;
  splits: Pick<BlockSplit, 'kind' | 'name' | 'sec' | 'distanceM'>[];
}

export interface Bottleneck {
  /** The station furthest off the athlete's own best in the latest sim (seconds), when any is. */
  slowest: { station: string; sec: number; bestSec: number; deltaSec: number } | null;
  /** Which station costs the run after it most across sims (hyrox.ts compromisedRunningAcross). */
  runCost: { station: string; avgVsFirstPct: number; sessions: number } | null;
  lines: string[];
  coachLines: string[];
}

/** Needs at least two simulations with station splits; null otherwise. */
export function bottleneckStations(sims: RaceSimResult[]): Bottleneck | null {
  const sorted = [...sims].sort((a, b) => a.date.localeCompare(b.date)).filter((s) => s.splits.some((x) => x.kind === 'station'));
  if (sorted.length < 2) return null;
  const latest = sorted.at(-1)!;
  const history = sorted.slice(0, -1).map((s) => ({ date: s.date, stations: s.splits.filter((x) => x.kind === 'station').map((x) => ({ station: x.name, sec: x.sec })) }));
  const vs = stationsVsBest(latest.splits.filter((x) => x.kind === 'station').map((x) => ({ station: x.name, sec: x.sec })), history);
  const off = vs.filter((x) => x.deltaSec != null && x.deltaSec > 0).sort((a, b) => b.deltaSec! - a.deltaSec!)[0];
  const inputs: CompromisedInput[] = sorted.map((s) => {
    const runs = s.splits.filter((x) => x.kind === 'run');
    const order = s.splits.filter((x) => x.kind === 'station').map((x) => x.name);
    return { runSec: runs.map((r) => r.sec), runDistanceM: runs.map((r) => r.distanceM ?? 1000), stations: order };
  });
  const across = compromisedRunningAcross(inputs);
  const cost = across?.byStation[0] && across.byStation[0].avgVsFirstPct >= 3 ? across.byStation[0] : null;
  const lines: string[] = [];
  const coachLines: string[] = [];
  if (off) {
    const l = `${off.station} ${formatRaceTime(off.sec)} last time, ${off.deltaSec} s off the best (${formatRaceTime(off.bestSec!)})`;
    lines.push(`${l.replace('the best', 'your best')}`);
    coachLines.push(l);
  }
  if (across && cost) {
    lines.push(across.lines[0]!);
    coachLines.push(across.coachLines[0]!);
  }
  return {
    slowest: off ? { station: off.station, sec: off.sec, bestSec: off.bestSec!, deltaSec: off.deltaSec! } : null,
    runCost: cost ? { station: cost.station, avgVsFirstPct: cost.avgVsFirstPct, sessions: cost.sessions } : null,
    lines,
    coachLines,
  };
}

/* ---------- small helpers for result rows ---------- */

/** "5 × 1 km: 4:21, 4:30, 4:32, 4:35, 4:38" for an intervals history row. */
export function splitsLine(splits: Pick<BlockSplit, 'sec' | 'distanceM'>[]): string {
  if (!splits.length) return '';
  const d = splits[0]!.distanceM;
  const same = splits.every((s) => s.distanceM === d);
  return `${same && d ? `${splits.length} × ${distanceText(d)}: ` : ''}${splits.map((s) => formatRaceTime(s.sec)).join(', ')}`;
}
