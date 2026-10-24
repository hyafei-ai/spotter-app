import { describe, expect, it } from 'vitest';
import {
  DEMO_RAVI_ID,
  DEMO_RUTH_ID,
  DEMO_SASHA_ID,
  demoRaceEvidence,
  demoRaceGoal,
  multisportDays,
  multisportPatterns,
  multisportScored,
  multisportWins,
} from '../src/demo/multisport';
import { demoRosterPatterns } from '../src/demo/coachToday';
import {
  EMPTY_SCORE,
  WatchSessionPlan,
  aerobicEfficiency,
  blocksFromTemplate,
  bottleneckStations,
  buildTimeline,
  compromisedRunningPattern,
  conditioningSleep,
  findPatterns,
  movementTrends,
  newWorkoutBlock,
  predictRaceFinish,
  raceReadiness,
  scoreBests,
  scoreHistories,
  sessionLoad,
  templateById,
  watchActivityType,
  watchBlockOrigins,
  watchPlanFromSession,
  watchResultToBlockResults,
  type SessionPlan,
  type WatchResult,
} from '../src';
import { LOWER_A } from '../src/demo/client';

const NOW = new Date('2026-10-23T12:00:00');
const today = '2026-10-23';
let n = 0;
const ids = () => `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`;

describe('patterns for non-lifters (MOCK demo clients)', () => {
  it('a WOD athlete: conditioning dips after short nights, and scores improve', () => {
    const kinds = multisportPatterns(DEMO_RAVI_ID, NOW).map((p) => p.kind);
    expect(kinds).toContain('conditioning_sleep');
    expect(kinds).toContain('conditioning_trend');
    const p = multisportPatterns(DEMO_RAVI_ID, NOW).find((x) => x.kind === 'conditioning_sleep')!;
    expect(p.title).toMatch(/^Conditioning scores tend to be \d+% worse after short nights$/);
    expect(p.n.a).toBeGreaterThanOrEqual(6);
  });

  it('a race-format athlete: faster at the same heart rate, and the sled push costs the next run', () => {
    const ps = multisportPatterns(DEMO_SASHA_ID, NOW);
    expect(ps.map((p) => p.kind)).toEqual(expect.arrayContaining(['aerobic_efficiency', 'compromised_running']));
    expect(ps.find((p) => p.kind === 'compromised_running')!.title).toMatch(/^Runs after sled push tend to be \d+% slower than the other runs$/);
    expect(ps.find((p) => p.kind === 'aerobic_efficiency')!.title).toMatch(/faster at the same heart rate/);
  });

  it('a masters runner: faster at the same heart rate; the coach roster shows it', () => {
    expect(multisportPatterns(DEMO_RUTH_ID, NOW).map((p) => p.kind)).toContain('aerobic_efficiency');
    expect(demoRosterPatterns(DEMO_RUTH_ID, NOW).length).toBeGreaterThan(0);
  });

  it('wins that aren’t lifts', () => {
    const ruth = multisportWins(DEMO_RUTH_ID, NOW).mention.map((w) => w.coachText);
    expect(ruth.some((t) => /5 km time trial best yet: /.test(t))).toBe(true);
    expect(multisportWins(DEMO_RAVI_ID, NOW).mention.length).toBeGreaterThan(0);
  });

  it('the detectors stay quiet without enough data', () => {
    const days = buildTimeline({ sessions: [] }, '2026-08-01', today);
    expect(conditioningSleep(days)).toBeNull();
    expect(aerobicEfficiency(days)).toBeNull();
    expect(compromisedRunningPattern(days)).toBeNull();
    expect(findPatterns(days)).toEqual([]);
  });

  it('block sessions carry their scores and minutes into the timeline', () => {
    const days = multisportDays(DEMO_RAVI_ID, NOW)!;
    const s = days.flatMap((d) => d.training.sessions).find((x) => x.scores?.length)!;
    expect(s.scores![0]!.text).toMatch(/^(Fran|Cindy|Helen|Grace|Karen|AMRAP 12|21-15-9|Jackie)/);
    expect(s.load).toBe(sessionLoad(s.minutes, 3, s.rpe));
  });
});

describe('histories, movement trends and the bottleneck', () => {
  it('score histories read like a coach would say them', () => {
    const h = scoreHistories(multisportScored(DEMO_RAVI_ID, NOW));
    const fran = h.find((x) => x.key === 'benchmark.fran')!;
    expect(fran.line).toMatch(/^Fran · \d+:\d\d · /);
    expect(fran.trend).toMatch(/faster than your first, across \d+ times/);
  });

  it('station and run trends against the athlete’s own last sessions', () => {
    const sims = multisportScored(DEMO_SASHA_ID, NOW).filter((s) => s.results[0]!.kind === 'station_race').map((s) => ({ date: s.date, splits: s.results[0]!.splits }));
    const t = movementTrends(sims);
    expect(t.find((x) => x.name === 'Wall balls')!.deltaPct).toBeGreaterThan(0);
    expect(t.find((x) => x.name === 'Runs')!.unit).toBe('s/km');
    const b = bottleneckStations(sims)!;
    expect(b.slowest!.station).toBe('Wall balls');
    expect(b.runCost!.station).toBe('Sled push');
    expect(b.coachLines[1]).toMatch(/Running pace drops most after sled push/);
  });

  it('score bests need something earlier to beat', () => {
    const r = (sec: number) => ({ key: 'k', label: 'Fran', kind: 'rep_scheme' as const, scoring: 'time' as const, score: { ...EMPTY_SCORE, timeSec: sec }, splits: [] });
    const wins = scoreBests([{ date: '2026-09-01', results: [r(300)] }, { date: '2026-10-01', results: [r(280)] }, { date: '2026-10-10', results: [r(290)] }]);
    expect(wins).toHaveLength(1);
    expect(wins[0]!.text).toBe('Fran 4:40, 0:20 faster than your best');
  });

  it('the race estimate and readiness read from the sims', () => {
    const goal = demoRaceGoal(DEMO_SASHA_ID, NOW)!;
    const ev = demoRaceEvidence(DEMO_SASHA_ID, NOW);
    const est = predictRaceFinish({ race: { date: goal.date, format: 'full' }, today, officialRaces: [], sims: ev.sims });
    expect(est.estimateSec).not.toBeNull();
    expect(raceReadiness({ race: { date: goal.date, format: 'full' }, today, sessions: ev.sessions }).dimensions).toHaveLength(5);
  });
});

describe('the watch runs blocks', () => {
  const sim = blocksFromTemplate(templateById('race.half.singles.open_women')!, ids).blocks[0]!;
  const plan: SessionPlan = {
    ...LOWER_A,
    exercises: LOWER_A.exercises.slice(0, 1),
    blocks: [
      { id: 'st', kind: 'strength', title: null, note: null, scoring: 'load', timeCapSec: null, templateId: null, exerciseIds: [LOWER_A.exercises[0]!.id] },
      { ...newWorkoutBlock('intervals', ids), id: 'iv' },
      { ...sim, id: 'sim' },
      { ...newWorkoutBlock('amrap', ids), id: 'am' },
    ],
  };

  it('maps every block kind to the existing contract, in order', () => {
    const w = watchPlanFromSession(plan, { version: 'planned', units: 'kg', incrementKg: 2.5 });
    expect(WatchSessionPlan.safeParse(w).success).toBe(true);
    expect(w.blocks.map((b) => b.kind)).toEqual(['strength', 'interval', 'interval', 'station', 'interval', 'station', 'interval', 'station', 'interval', 'station', 'timed']);
    expect(w.order[0]).toEqual([0, 0]);
    expect(w.order.filter(([b]) => b === 1)).toHaveLength(5);
    expect(watchActivityType(w)).toBe(63);
    expect(watchBlockOrigins(plan).slice(0, 3).map((o) => o?.blockId ?? null)).toEqual([null, 'iv', 'sim']);
  });

  it('a strength-only plan is unchanged', () => {
    expect(watchPlanFromSession({ ...LOWER_A, blocks: undefined }, { version: 'planned', units: 'kg', incrementKg: 2.5 })).toEqual(watchPlanFromSession(LOWER_A, { version: 'planned', units: 'kg', incrementKg: 2.5 }));
  });

  it('results come back as block results with splits', () => {
    const w = watchPlanFromSession(plan, { version: 'planned', units: 'kg', incrementKg: 2.5 });
    const origins = watchBlockOrigins(plan);
    const result: WatchResult = {
      v: 1,
      kind: 'session',
      resultId: '00000000-0000-7000-8000-0000000000ff',
      planId: w.planId,
      programDayId: w.programDayId,
      date: w.date,
      title: w.title,
      version: 'planned',
      startedAt: '2026-10-23T08:00:00.000Z',
      endedAt: '2026-10-23T09:00:00.000Z',
      ended: 'finished',
      sets: [],
      intervals: [
        ...[0, 1, 2, 3, 4].map((i) => ({ b: 1, i, workSec: 270 + i, distanceM: 1000, avgHr: 160, maxHr: 170 })),
        { b: 2, i: 0, workSec: 260, distanceM: 1000, avgHr: 158, maxHr: 165 },
      ],
      stations: [{ b: 3, sec: 250, avgHr: 160, maxHr: 170 }],
      timed: [{ b: 10, sec: 720 }],
      hr: null,
      hrRecovery: null,
    };
    const rs = watchResultToBlockResults(result, w, origins);
    const iv = rs.find((r) => r.blockId === 'iv')!;
    expect(iv.splits).toHaveLength(5);
    expect(iv.score).toMatchObject({ timeSec: 1360, distanceM: 5000 });
    const race = rs.find((r) => r.blockId === 'sim')!;
    expect(race.splits.map((s) => s.kind)).toEqual(['run', 'station']);
    expect(rs.find((r) => r.blockId === 'am')!.score.rounds).toBeNull();
  });
});
