import { describe, expect, it } from 'vitest';
import { STARTER_LIBRARY } from '../src/library';
import {
  EXERCISE_REGIONS,
  activityExerciseId,
  monotonyStrain,
  ongoingPain,
  painText,
  regionLoads,
  regionLoadsForSession,
  returnGuidance,
  type InjurySession,
} from '../src/injury';
import type { PainLog } from '../src/physiology';

const TODAY = '2026-10-23';
const iso = (offset: number) => new Date(Date.UTC(2026, 9, 23) + offset * 86_400_000).toISOString().slice(0, 10);

describe('exercise → region table', () => {
  it('covers every starter library exercise', () => {
    const missing = STARTER_LIBRARY.map((e) => e.id).filter((id) => !(id in EXERCISE_REGIONS));
    expect(missing).toEqual([]);
  });
});

describe('region load', () => {
  it('splits a session’s load by share of sets', () => {
    const r = regionLoadsForSession({ date: TODAY, load: 300, sets: [{ exerciseId: 'back-squat' }, { exerciseId: 'back-squat' }, { exerciseId: 'bench-press' }] });
    expect(r.knee).toBe(200);
    expect(r.shoulder).toBe(100);
    expect(r.wrist).toBeUndefined();
  });

  it('flags a region whose 7-day load is 1.5× its usual week', () => {
    const sessions: InjurySession[] = [];
    // Four weeks of one squat session a week, then two extra runs this week.
    for (const w of [0, 1, 2, 3]) sessions.push({ date: iso(-w * 7 - 1), load: 300, sets: [{ exerciseId: 'back-squat' }] });
    sessions.push({ date: iso(-2), load: 240, sets: [{ exerciseId: activityExerciseId('run') }] });
    sessions.push({ date: iso(-4), load: 240, sets: [{ exerciseId: activityExerciseId('run') }] });
    const knee = regionLoads(sessions, TODAY).find((r) => r.region === 'knee')!;
    expect(knee.acute).toBe(780);
    expect(knee.ratio).toBeGreaterThanOrEqual(1.5);
    expect(knee.spike).toBe(true);
    const back = regionLoads(sessions, TODAY).find((r) => r.region === 'lower_back')!;
    expect(back.spike).toBe(false);
  });

  it('says nothing without 21 days of history', () => {
    const r = regionLoads([{ date: iso(-3), load: 300, sets: [{ exerciseId: 'back-squat' }] }], TODAY);
    expect(r.every((x) => x.ratio === null && !x.spike)).toBe(true);
  });
});

describe('monotony and strain (Foster)', () => {
  it('is null with no training this week', () => {
    expect(monotonyStrain([], TODAY)).toEqual({ weeklyLoad: 0, monotony: null, strain: null, high: false });
  });

  it('is high when every day is a similar load', () => {
    const s = Array.from({ length: 7 }, (_, i) => ({ date: iso(-i), load: 300 + (i % 2) * 20 }));
    const m = monotonyStrain(s, TODAY);
    expect(m.monotony).toBeGreaterThan(2);
    expect(m.high).toBe(true);
    expect(m.strain).toBe(Math.round(m.weeklyLoad * m.monotony!));
  });

  it('is low with rest days between hard days', () => {
    const m = monotonyStrain([{ date: iso(0), load: 400 }, { date: iso(-2), load: 400 }, { date: iso(-4), load: 400 }], TODAY);
    expect(m.monotony).toBeLessThan(2);
    expect(m.high).toBe(false);
  });
});

describe('pain', () => {
  const log = (offset: number, level: number, region: PainLog['region'] = 'knee'): PainLog => ({ id: `p${offset}${region}`, date: iso(offset), region, side: 'left', level, note: null });

  it('is ongoing at 3 days of 14', () => {
    const p = ongoingPain([log(-2, 3), log(-1, 3), log(0, 4)], TODAY);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ region: 'knee', days: 3, streak: 3, latestLevel: 4 });
    expect(painText(p[0]!)).toBe('Left knee pain logged 3 of the last 14 days (4/10 most recently)');
  });

  it('is ongoing at a single 6/10', () => {
    expect(ongoingPain([log(0, 6, 'lower_back')], TODAY)[0]).toMatchObject({ region: 'lower_back', maxLevel: 6 });
  });

  it('is not ongoing for two mild days, or for old logs', () => {
    expect(ongoingPain([log(-1, 2), log(0, 2)], TODAY)).toEqual([]);
    expect(ongoingPain([log(-20, 8), log(-19, 8), log(-18, 8)], TODAY)).toEqual([]);
  });

  it('return guidance is conservative, names the coach and never diagnoses', () => {
    const g = returnGuidance('knee', 3, 'Maya');
    expect(g[0]).toBe('Keep it pain-free: if it hurts above 3/10 during a set, stop that exercise and tell Maya.');
    const high = returnGuidance('knee', 8, 'Maya').join(' ');
    expect(high).toMatch(/doctor or physio/);
    expect(high).not.toMatch(/tendin|strain|sprain|tear|injury is/i);
  });
});
