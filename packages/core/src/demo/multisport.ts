/*
 * MOCK DATA: three demo clients who don't lift for a living, so Coach Today and the client page show what Spotter
 * finds for any trainer style (docs/ux/multisport.md, docs/ports.md row 7). Invented numbers, labelled as such,
 * deterministic for a given date (no Math.random).
 *
 * - Sasha Okafor: race-format (hybrid) athlete, 16 weeks: a strength day, threshold kilometres with heart rate from
 *   the watch, and a full race simulation every other week. Built in: pace at the same heart rate improves, runs
 *   after the sled push slow the most, and the latest wall balls are off their best. A race in 8 weeks.
 * - Ravi Kapoor: functional-fitness (WOD) athlete, five classes a week, ten workouts on rotation. Built in: scores
 *   improve over the 16 weeks and run lower after short nights.
 * - Ruth Adeyemi (58): masters runner. Intervals, easy runs, long runs and a monthly 5 km time trial with heart
 *   rate. Built in: pace at the same heart rate improves, the latest 5 km is a best, resting heart rate comes down.
 * Ages come from DEMO_CLIENT_AGES, never from names.
 */
import { buildTimeline, type ClientDay, type TimelineSessionInput } from '../timeline';
import { findPatterns, type Pattern } from '../patterns';
import { winsToMention, weeklyWins, type MastersInput, type MastersWin } from '../masters';
import { EMPTY_SCORE } from '../blocks';
import type { BlockResult, BlockSplit } from '../schemas';
import type { WearableDay } from '../physiology';
import type { RaceGoal, RaceResultInput, ReadinessSession } from '../race';
import type { ScoredSession } from '../trends';

const id = (n: number) => `0192f0a2-0000-7000-8000-${String(n).padStart(12, '0')}`;
export const DEMO_SASHA_ID = id(9);
export const DEMO_RAVI_ID = id(10);
export const DEMO_RUTH_ID = id(11);
export const MULTISPORT_CLIENT_IDS = [DEMO_SASHA_ID, DEMO_RAVI_ID, DEMO_RUTH_ID];

const DAYS = 112;
const START = -(DAYS - 1);

function isoLocal(offsetDays: number, base: Date): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** A fixed wobble in −1…1 for day o. */
const wobble = (o: number) => Math.round(Math.sin(o * 2.17 + 0.6) * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;
const wd = (o: number, seed: number) => (((o + seed) % 7) + 7) % 7;
/** Progress through the 16 weeks, 0 → 1. */
const prog = (o: number) => (o - START) / (DAYS - 1);
/** MOCK short night before day o: about one in four, deterministic per client. */
const shortNight = (o: number, seed: number) => ((((o * 7919 + seed * 31) % 29) + 29) % 29) < 7;

const split = (kind: BlockSplit['kind'], name: string, index: number, sec: number, distanceM: number | null, avgHr: number | null = null): BlockSplit => ({
  kind,
  name,
  index,
  sec: Math.round(sec),
  distanceM,
  avgHr: avgHr == null ? null : Math.round(avgHr),
  maxHr: avgHr == null ? null : Math.round(avgHr + 8),
});

function wearables(now: Date, seed: number, sleep: number, rhrFrom: number, rhrTo: number, hrv: number): WearableDay[] {
  const out: WearableDay[] = [];
  for (let o = START; o <= 0; o++) {
    out.push({
      date: isoLocal(o, now),
      sleepHours: shortNight(o, seed) ? r1(5.9 + wobble(o + seed) * 0.2) : r1(sleep + wobble(o * 3 + seed) * 0.35),
      hrvMs: r1(hrv + wobble(o * 5 + seed) * 2),
      restingHr: Math.round(rhrFrom + (rhrTo - rhrFrom) * prog(o) + wobble(o + seed) * 0.8),
      activeKcal: Math.round(520 + wobble(o * 7 + seed) * 120),
      source: 'apple_health',
    });
  }
  return out;
}

/* ---------- Sasha: race-format ---------- */

const RACE_STATIONS: [string, number | null, number | null, number][] = [
  // name, distance m, reps, MOCK base seconds
  ['SkiErg', 1000, null, 272],
  ['Sled push', 50, null, 188],
  ['Sled pull', 50, null, 236],
  ['Burpee broad jumps', 80, null, 262],
  ['Row', 1000, null, 281],
  ['Farmers carry', 200, null, 112],
  ['Sandbag lunges', 100, null, 298],
  ['Wall balls', null, 100, 322],
];

function sashaSessions(now: Date): TimelineSessionInput[] {
  const out: TimelineSessionInput[] = [];
  let sim = 0;
  for (let o = START; o <= 0; o++) {
    const date = isoLocal(o, now);
    const d = wd(o, 2);
    const p = prog(o);
    if (d === 0) {
      const kg = Math.round((90 + 6 * p) * 2) / 2;
      out.push({ date, title: 'Strength + sled', durationMin: 55, feel: 4, startedAt: `${date}T07:10:00`, sets: Array.from({ length: 4 }, () => ({ exerciseId: 'back-squat', weightKg: kg, reps: 5, rpe: 8 })) });
    } else if (d === 2) {
      // Threshold kilometres: pace improves about 9% over 16 weeks at the same heart rate (MOCK).
      const pace = 298 - 26 * p;
      const splits = [0, 1, 2, 3, 4].map((i) => split('interval', `Rep ${i + 1}`, i, pace + i * 2 + wobble(o * 3 + i) * 2, 1000, 166 + i + wobble(o + i)));
      out.push({
        date,
        title: 'Threshold kilometres',
        durationMin: 42,
        feel: 3,
        startedAt: `${date}T18:05:00`,
        sets: [],
        blocks: [{ key: 'run.threshold-5x1k', label: '5 × 1 km', kind: 'intervals', scoring: 'time', score: { ...EMPTY_SCORE, timeSec: splits.reduce((a, s) => a + s.sec, 0), distanceM: 5000 }, splits, rpe: 8 }],
      });
    } else if (d === 5 && Math.floor((o - START) / 7) % 2 === 1) {
      // Race simulation every other week: runs after the sled push slow most; wall balls slip at the end (MOCK).
      sim++;
      const first = 268 - 10 * p;
      const latest = o > -14;
      const splits: BlockSplit[] = [];
      RACE_STATIONS.forEach(([name, m, , base], i) => {
        const slow = i === 0 ? 0 : RACE_STATIONS[i - 1]![0] === 'Sled push' ? 0.1 + wobble(o + i) * 0.01 : 0.03 + wobble(o * 2 + i) * 0.015;
        splits.push(split('run', `Run ${i + 1}`, splits.length, first * (1 + slow), 1000, 162 + i));
        const sec = base * (1 - 0.06 * p) + wobble(o + i * 3) * 4 + (latest && name === 'Wall balls' ? 24 : 0);
        splits.push(split('station', name, splits.length, sec, m, 158 + i));
      });
      const total = splits.reduce((a, s) => a + s.sec, 0);
      out.push({
        date,
        title: 'Race simulation',
        durationMin: Math.round(total / 60) + 10,
        feel: 2,
        startedAt: `${date}T09:00:00`,
        sets: [],
        blocks: [{ key: 'station_race:race simulation', label: 'Race simulation', kind: 'station_race', scoring: 'time', score: { ...EMPTY_SCORE, timeSec: total }, splits, rpe: 9 }],
      });
      void sim;
    } else if (d === 4) {
      out.push({ date, title: 'Easy run', durationMin: 40, feel: 4, startedAt: `${date}T07:00:00`, sets: [], blocks: [{ key: 'intervals:run:1x7000m', label: '7 km run', kind: 'intervals', scoring: 'time', score: { ...EMPTY_SCORE, timeSec: Math.round(7 * (352 - 12 * p)), distanceM: 7000 }, splits: [split('interval', 'Run', 0, 7 * (352 - 12 * p), 7000, 142)], rpe: 4 }] });
    }
  }
  return out;
}

/* ---------- Ravi: functional fitness ---------- */

/** MOCK rotation: label, scoring and a base score (seconds for time, rounds × 1000 + reps for AMRAPs). */
const WODS: { key: string; label: string; kind: BlockResult['kind']; scoring: 'time' | 'rounds_reps'; base: number }[] = [
  { key: 'benchmark.fran', label: 'Fran', kind: 'rep_scheme', scoring: 'time', base: 310 },
  { key: 'benchmark.cindy', label: 'Cindy', kind: 'amrap', scoring: 'rounds_reps', base: 17_008 },
  { key: 'benchmark.helen', label: 'Helen', kind: 'rounds_for_time', scoring: 'time', base: 655 },
  { key: 'benchmark.grace', label: 'Grace', kind: 'for_time', scoring: 'time', base: 228 },
  { key: 'benchmark.karen', label: 'Karen', kind: 'for_time', scoring: 'time', base: 512 },
  { key: 'amrap:720:burpee+wall-ball', label: 'AMRAP 12', kind: 'amrap', scoring: 'rounds_reps', base: 6_012 },
  { key: 'rep_scheme:21-15-9:deadlift+burpee', label: '21-15-9', kind: 'rep_scheme', scoring: 'time', base: 395 },
  { key: 'benchmark.jackie', label: 'Jackie', kind: 'for_time', scoring: 'time', base: 540 },
];

function raviSessions(now: Date): TimelineSessionInput[] {
  const out: TimelineSessionInput[] = [];
  let k = 0;
  for (let o = START; o <= 0; o++) {
    const d = wd(o, 4);
    if (![0, 1, 2, 4, 5].includes(d)) continue;
    const date = isoLocal(o, now);
    const w = WODS[k++ % WODS.length]!;
    // Better by about 7% over the 16 weeks; about 7% worse after a short night (MOCK).
    const factor = 1 + 0.07 * prog(o) - (shortNight(o, 10) ? 0.07 : 0) + wobble(o * 11) * 0.012;
    let score: BlockResult['score'];
    if (w.scoring === 'time') score = { ...EMPTY_SCORE, timeSec: Math.round(w.base / factor) };
    else {
      const total = Math.round((Math.floor(w.base / 1000) * 30 + (w.base % 1000)) * factor);
      score = { ...EMPTY_SCORE, rounds: Math.floor(total / 30), reps: total % 30 };
    }
    const sets = d === 0 || d === 4 ? Array.from({ length: 5 }, () => ({ exerciseId: d === 0 ? 'back-squat' : 'deadlift', weightKg: d === 0 ? 100 : 140, reps: 3, rpe: 8 })) : [];
    out.push({ date, title: d === 0 || d === 4 ? `Strength + ${w.label}` : w.label, durationMin: 60, feel: 3, startedAt: `${date}T06:30:00`, sets, blocks: [{ key: w.key, label: w.label, kind: w.kind, scoring: w.scoring, score, splits: [], rpe: 9 }] });
  }
  return out;
}

/* ---------- Ruth: masters runner ---------- */

function ruthSessions(now: Date): TimelineSessionInput[] {
  const out: TimelineSessionInput[] = [];
  for (let o = START; o <= 0; o++) {
    const date = isoLocal(o, now);
    const d = wd(o, 6);
    const p = prog(o);
    const run = (key: string, label: string, m: number, pace: number, hr: number, rpe: number) => ({
      key,
      label,
      kind: 'intervals' as const,
      scoring: 'time' as const,
      score: { ...EMPTY_SCORE, timeSec: Math.round((m / 1000) * pace), distanceM: m },
      splits: [split('interval', 'Run', 0, (m / 1000) * pace, m, hr)],
      rpe,
    });
    if (d === 1) {
      const pace = 362 - 36 * p;
      const splits = [0, 1, 2, 3, 4].map((i) => split('interval', `Rep ${i + 1}`, i, pace + i * 2 + wobble(o * 3 + i) * 2, 1000, 151 + i + wobble(o + i)));
      out.push({ date, title: '5 × 1 km', durationMin: 45, feel: 3, startedAt: `${date}T07:30:00`, sets: [], blocks: [{ key: 'run.threshold-5x1k', label: '5 × 1 km', kind: 'intervals', scoring: 'time', score: { ...EMPTY_SCORE, timeSec: splits.reduce((a, s) => a + s.sec, 0), distanceM: 5000 }, splits, rpe: 7 }] });
    } else if (d === 3) {
      out.push({ date, title: 'Easy run', durationMin: 40, feel: 4, startedAt: `${date}T07:30:00`, sets: [], blocks: [run('intervals:run:1x6000m', '6 km run', 6000, 420 - 32 * p, 134, 4)] });
    } else if (d === 6 && Math.floor((o - START) / 7) % 4 === 3) {
      // A 5 km time trial every fourth week; the latest is the best (MOCK).
      out.push({ date, title: '5 km time trial', durationMin: 35, feel: 2, startedAt: `${date}T08:00:00`, sets: [], blocks: [run('run.5k-time-trial', '5 km time trial', 5000, 340 - 26 * p, 160, 9)] });
    } else if (d === 6) {
      out.push({ date, title: 'Long run', durationMin: 75, feel: 4, startedAt: `${date}T08:00:00`, sets: [], blocks: [run('intervals:run:1x12000m', '12 km run', 12000, 415 - 30 * p, 138, 5)] });
    }
  }
  return out;
}

/* ---------- exports ---------- */

interface Data {
  sessions: TimelineSessionInput[];
  wearables: WearableDay[];
  birthDate: string | null;
  coachStart: string;
}

function dataFor(clientId: string, now: Date): Data | null {
  if (clientId === DEMO_SASHA_ID) return { sessions: sashaSessions(now), wearables: wearables(now, 9, 7.6, 52, 49, 62), birthDate: null, coachStart: '2026-05-04' };
  if (clientId === DEMO_RAVI_ID) return { sessions: raviSessions(now), wearables: wearables(now, 10, 7.2, 56, 55, 54), birthDate: null, coachStart: '2026-02-16' };
  if (clientId === DEMO_RUTH_ID) return { sessions: ruthSessions(now), wearables: wearables(now, 11, 7.4, 58, 54, 38), birthDate: isoLocal(-(58 * 365 + 14 + 120), now), coachStart: '2025-11-03' };
  return null;
}

/** MOCK: a multisport demo client's daily history (16 weeks), or null for other clients. */
export function multisportDays(clientId: string, now = new Date()): ClientDay[] | null {
  const d = dataFor(clientId, now);
  if (!d) return null;
  return buildTimeline({ sessions: d.sessions, wearables: d.wearables }, isoLocal(START, now), isoLocal(0, now));
}

export function multisportPatterns(clientId: string, now = new Date()): Pattern[] {
  const days = multisportDays(clientId, now);
  return days ? findPatterns(days) : [];
}

/** MOCK: the scored blocks of a multisport client's sessions, for Progress and score wins. */
export function multisportScored(clientId: string, now = new Date()): ScoredSession[] {
  return (dataFor(clientId, now)?.sessions ?? []).filter((s) => s.blocks?.length).map((s) => ({ date: s.date, results: s.blocks! }));
}

export function multisportMastersInput(clientId: string, now = new Date()): MastersInput | null {
  const d = dataFor(clientId, now);
  if (!d) return null;
  return { sessions: d.sessions, wearables: d.wearables, birthDate: d.birthDate, coachStart: d.coachStart, scored: multisportScored(clientId, now) };
}

export function multisportWins(clientId: string, now = new Date()): { mention: MastersWin[]; week: MastersWin[] } {
  const input = multisportMastersInput(clientId, now);
  if (!input) return { mention: [], week: [] };
  const today = isoLocal(0, now);
  return { mention: winsToMention(input, today), week: weeklyWins(input, today) };
}

/** MOCK: Sasha's race goal (the coach set it; event and target invented). */
export function demoRaceGoal(clientId: string, now = new Date()): RaceGoal | null {
  if (clientId !== DEMO_SASHA_ID) return null;
  return { event: 'Spring race, Manchester (MOCK)', kind: 'race_sim', date: isoLocal(56, now), targetSec: 64 * 60, division: null, format: 'full' };
}

/* ---------- demo transport for race goals (real builds: race_goals) ---------- */

export interface SharedRaceGoal extends RaceGoal {
  setBy: 'coach' | 'client';
  /** The race_goals row id (client-set goals). */
  goalId?: string;
  updatedAt: string;
}
/** Keyed by the coach-side client id (coachClientIdFor maps the client app's demo user). */
export interface SharedRaceDoc {
  goals: Record<string, SharedRaceGoal | null>;
}
export const EMPTY_SHARED_RACE: SharedRaceDoc = { goals: {} };
export const raceKey = (tenantSlug: string) => `spotter.race.${tenantSlug}`;

/** The goal for a client: what was saved, else the MOCK seed (Sasha). A saved null means removed. */
export function raceGoalFrom(doc: SharedRaceDoc, clientId: string, now = new Date()): RaceGoal | null {
  if (clientId in doc.goals) return doc.goals[clientId] ?? null;
  return demoRaceGoal(clientId, now);
}

/** MOCK: race-format sessions and simulation results for race.ts (predictor and readiness). */
export function demoRaceEvidence(clientId: string, now = new Date()): { sims: RaceResultInput[]; sessions: ReadinessSession[] } {
  const d = dataFor(clientId, now);
  if (!d) return { sims: [], sessions: [] };
  const sims: RaceResultInput[] = [];
  const sessions: ReadinessSession[] = d.sessions.map((s) => {
    const race = s.blocks?.find((b) => b.kind === 'station_race');
    if (race?.score.timeSec) sims.push({ date: s.date, sec: race.score.timeSec, format: 'full' });
    const hr = race?.splits.filter((x) => x.avgHr != null).map((x) => x.avgHr!) ?? [];
    return { date: s.date, raceFormat: !!race, finishSec: race?.score.timeSec ?? null, format: race ? 'full' : null, avgHr: hr.length ? Math.round(hr.reduce((a, b) => a + b, 0) / hr.length) : null };
  });
  return { sims, sessions };
}
