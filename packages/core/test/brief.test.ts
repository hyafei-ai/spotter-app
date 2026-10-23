import { describe, expect, it } from 'vitest';
import { dailyBrief, sharedBrief, type BriefInput } from '../src/brief';
import { dailyRead, type DailyCheck, type DailyRead } from '../src/signals';
import type { BaselineStatus } from '../src/wearables';
import type { CycleEstimate, FuelPattern, PhaseAdjustment } from '../src/physiology';
import type { OngoingPain } from '../src/injury';
import { Mutation } from '../src/schemas';

const TODAY = '2026-10-23';
const iso = (offset: number) => new Date(Date.UTC(2026, 9, 23) + offset * 86_400_000).toISOString().slice(0, 10);

const check = (patch: Partial<DailyCheck> = {}): DailyCheck => ({
  id: 'c',
  date: TODAY,
  sleepHours: 7.5,
  sleepSource: 'manual',
  energy: 4,
  soreness: 2,
  stress: 2,
  cyclePhase: null,
  shareCycle: false,
  note: null,
  shareWithCoach: true,
  submittedAt: `${TODAY}T07:00:00.000Z`,
  ...patch,
});

/** A read from real dailyRead with a given last-night sleep (two prior nights at `prior` hours). */
function read(lastNight: number, prior = 7.5, patch: Partial<DailyCheck> = {}): DailyRead {
  const c = check({ sleepHours: lastNight, ...patch });
  const history = [check({ date: iso(-2), sleepHours: prior }), check({ date: iso(-1), sleepHours: prior }), c];
  return dailyRead({ today: TODAY, check: c, history, load: { status: 'unknown', acute: 0, chronicWeekly: 0, ratio: null }, fuel: 'unknown' });
}

const hrvLow: BaselineStatus = { status: 'low', today: 40, baseline: 49, sd: 4, deltaPct: -18, delta: -9, readings: 20, source: 'apple_health' };
const hrvOk: BaselineStatus = { ...hrvLow, status: 'normal', today: 48, deltaPct: -2, delta: -1 };
const cycle = (patch: Partial<CycleEstimate> = {}): CycleEstimate => ({
  date: TODAY,
  mode: 'natural',
  phase: 'luteal',
  dayOfCycle: 24,
  typicalLength: 29,
  confidence: 'medium',
  nextPeriod: null,
  note: 'Day 24 of about 29, luteal phase (based on your last 5 cycles)',
  irregularities: [],
  ...patch,
});
const cal: PhaseAdjustment = { phase: 'luteal', deltaPct: -3.2, appliedPct: -3, sessions: 12, cycles: 5, confidence: 'medium' };
const fuel: FuelPattern = {
  level: 'watch',
  signs: [{ kind: 'low_ea', text: 'Eating under what training needs 4 of the last 7 days' }],
  fixes: ['Eat carbs + protein within an hour after'],
  eaAverage: 27,
  eaBand: 'reduced',
};
const kneePain: OngoingPain = { region: 'knee', side: 'left', days: 3, maxLevel: 4, latestLevel: 4, latestDate: TODAY, streak: 3 };

const base = (patch: Partial<BriefInput> = {}): BriefInput => ({
  read: read(7.5),
  hrv: null,
  restingHr: null,
  cycle: null,
  calibration: null,
  fuel: null,
  injury: null,
  symptoms: null,
  hasLighter: true,
  coach: 'Maya',
  ...patch,
});

describe('dailyBrief', () => {
  it('good sleep, nothing else: good to go', () => {
    const b = dailyBrief(base({ hrv: hrvOk }));
    expect(b.tone).toBe('steady');
    expect(b.feel).toBe('You’re good to go');
    expect(b.todo).toEqual(['Train as planned']);
    expect(b.suggestLighter).toBe(false);
  });

  it('cycle phase alone is never a reason to ease off', () => {
    const b = dailyBrief(base({ read: read(7.5, 7.5, { cyclePhase: 'luteal' }), cycle: cycle(), calibration: cal }));
    expect(b.tone).toBe('steady');
    expect(b.suggestLighter).toBe(false);
    expect(b.why.find((r) => r.source === 'cycle')?.text).toBe('Luteal phase: your lifts usually run ~3% lower here (your own data, 5 cycles)');
    expect(b.calibration).toEqual({ appliedPct: -3, reason: expect.stringMatching(/your own data, 5 cycles/) });
    expect(b.why.map((r) => r.text).join(' ')).not.toMatch(/weak|problem|bad/i);
  });

  it('HRV low + short sleep: running tired, easier version first, strongest reason first', () => {
    const b = dailyBrief(base({ read: read(5.2), hrv: hrvLow }));
    expect(b.tone).toBe('ease');
    expect(b.feel).toBe('You’re running tired today');
    expect(b.why[0]).toEqual({ source: 'hrv', text: 'HRV 18% under your usual (Apple Watch)' });
    expect(b.why[1]!.source).toBe('sleep');
    expect(b.todo[0]).toBe('Take the easier version Maya set');
    expect(b.todo).toContain('Aim for bed by 10:30');
    expect(b.suggestLighter).toBe(true);
  });

  it('without a coach lighter version, keeps top sets at RPE 7', () => {
    expect(dailyBrief(base({ read: read(5.2), hrv: hrvLow, hasLighter: false })).todo[0]).toBe('Keep top sets at RPE 7');
  });

  it('hormonal contraception: no phase reason', () => {
    const b = dailyBrief(base({ cycle: cycle({ mode: 'hormonal', phase: null, note: 'Hormonal contraception' }), calibration: cal }));
    expect(b.why.some((r) => r.source === 'cycle')).toBe(false);
    expect(b.calibration).toBeNull();
  });

  it('one strain signal: mostly good, one thing to watch', () => {
    const b = dailyBrief(base({ fuel }));
    expect(b.tone).toBe('watch');
    expect(b.feel).toBe('Mostly good, one thing to watch');
    expect(b.why[0]).toEqual({ source: 'fuel', text: 'Eating under what training needs 4 of the last 7 days' });
    expect(b.todo).toContain('Eat carbs + protein within an hour after');
  });

  it('pain names the planned exercise that loads it, and tells the coach', () => {
    const b = dailyBrief(base({ injury: { pain: [{ ...kneePain, region: 'lower_back' }], regions: [], monotony: null }, planned: [{ exerciseId: 'deadlift', name: 'Deadlift' }] }));
    expect(b.todo[0]).toBe('Skip the deadlift if the back pain is above 3/10 and tell Maya');
  });

  it('a region load spike in the same region as pain counts as strain', () => {
    const b = dailyBrief(base({ injury: { pain: [kneePain], regions: [{ region: 'knee', acute: 900, chronicWeekly: 530, ratio: 1.7, spike: true }], monotony: null } }));
    expect(b.tone).toBe('ease');
    expect(b.why.map((r) => r.text)).toContain('Knee load this week is 1.7× your usual');
  });

  it('never counts fuel twice when the fuel pattern replaces the read’s fuel factor', () => {
    const r = dailyRead({ today: TODAY, check: check(), history: [check()], load: { status: 'unknown', acute: 0, chronicWeekly: 0, ratio: null }, fuel: 'low' });
    expect(dailyBrief(base({ read: r, fuel })).tone).toBe('watch');
  });

  it('keeps at most 3 reasons and 3 to-dos', () => {
    const b = dailyBrief(
      base({ read: read(5.2, 7.5, { soreness: 5, energy: 1 }), hrv: hrvLow, fuel, injury: { pain: [kneePain], regions: [], monotony: null }, symptoms: { night_sweats: 3 } }),
    );
    expect(b.why).toHaveLength(3);
    expect(b.todo.length).toBeLessThanOrEqual(3);
  });

  it('on a rest day, talks about the day rather than sets', () => {
    const b = dailyBrief(base({ read: read(5.2), hrv: hrvLow, hasLighter: false, restDay: true }));
    expect(b.todo[0]).toBe('Keep today easy: a walk or some mobility is plenty');
    expect(b.todo.join(' ')).not.toMatch(/RPE|easier version/);
    expect(dailyBrief(base({ hasLighter: false, restDay: true })).todo).toEqual(['Nothing else needed today: enjoy it']);
  });

  it('with nothing to go on, asks for a check-in', () => {
    const r = dailyRead({ today: TODAY, check: null, history: [], load: { status: 'unknown', acute: 0, chronicWeekly: 0, ratio: null }, fuel: 'unknown' });
    expect(dailyBrief(base({ read: r })).feel).toBe('Check in to get today’s brief');
  });
});

describe('sharedBrief', () => {
  const b = dailyBrief(base({ read: read(7.5), cycle: cycle(), calibration: cal, fuel, injury: { pain: [kneePain], regions: [], monotony: null } }));

  it('drops cycle, fuel and pain reasons (and their to-dos) unless shared', () => {
    const s = sharedBrief(b, { shareCycle: false, shareFuel: false, sharePain: false });
    expect(s.why.map((r) => r.source)).not.toContain('cycle');
    expect(s.why.map((r) => r.source)).not.toContain('fuel');
    expect(s.why.map((r) => r.source)).not.toContain('pain');
    expect(s.todo.join(' ')).not.toMatch(/carbs|knee/);
    expect(s.feel).toBe(b.feel);
  });

  it('keeps what the athlete shares', () => {
    const s = sharedBrief(b, { shareCycle: true, shareFuel: true, sharePain: true });
    expect(s.why).toEqual(b.why);
    expect(s.todo).toEqual(b.todo);
  });
});

describe('demo brief (MOCK data)', () => {
  it('reads “running tired” on first open, from HRV, resting HR and short sleep', async () => {
    const { demoDailyChecks, demoWearableDays } = await import('../src/demo');
    const { hrvStatus, restingHrStatus } = await import('../src/wearables');
    const now = new Date(2026, 9, 23, 9);
    const r = dailyRead({ today: TODAY, check: null, history: demoDailyChecks(now), load: { status: 'unknown', acute: 0, chronicWeekly: 0, ratio: null }, fuel: 'unknown' });
    const days = demoWearableDays(now);
    const b = dailyBrief(base({ read: r, hrv: hrvStatus(days, TODAY), restingHr: restingHrStatus(days, TODAY) }));
    expect(b.feel).toBe('You’re running tired today');
    expect(b.why.map((x) => x.source)).toEqual(['hrv', 'resting_hr', 'sleep']);
  });
});

describe('brief mutations', () => {
  const m = (kind: string, payload: unknown) => ({ clientMutationId: '0192f0a5-0000-7000-8000-000000000099', createdAt: '2026-10-23T07:00:00Z', kind, payload });
  const id = '0192f0a5-0000-7000-8000-000000000098';

  it('accepts pain.log, pain.delete, wearable.days and workout.import', () => {
    expect(Mutation.safeParse(m('pain.log', { painId: id, date: TODAY, region: 'knee', side: 'left', level: 4, note: null, shareWithCoach: true, loggedAt: '2026-10-23T07:00:00Z' })).success).toBe(true);
    expect(Mutation.safeParse(m('pain.log', { painId: id, date: TODAY, region: 'spleen', side: null, level: 4, note: null, shareWithCoach: true, loggedAt: '2026-10-23T07:00:00Z' })).success).toBe(false);
    expect(Mutation.safeParse(m('pain.delete', { painId: id, deletedAt: '2026-10-23T07:00:00Z' })).success).toBe(true);
    expect(Mutation.safeParse(m('wearable.days', { days: [{ date: TODAY, source: 'apple_health', sleepHours: 7, hrvMs: 48, restingHr: 58, activeKcal: 500 }] })).success).toBe(true);
    const workout = { externalId: 'hk-1', date: TODAY, startedAt: '2026-10-23T06:30:00Z', durationMin: 34, activity: 'run', activeKcal: 320, distanceM: 5200, avgHr: 148, maxHr: 168, source: 'apple_health', sourceApp: 'Workout', shareWithCoach: true };
    expect(Mutation.safeParse(m('workout.import', { workouts: [workout] })).success).toBe(true);
  });
});
