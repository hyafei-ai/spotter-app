import { describe, expect, it } from 'vitest';
import {
  applyLighter,
  dailyRead,
  fuelStatus,
  interventionOutcome,
  loadTrend,
  memberRisk,
  sessionLoad,
  sharedRead,
  sleepPattern,
  type DailyCheck,
  type MemberSignals,
} from '../src/signals';

const day = (offset: number) => new Date(Date.UTC(2026, 9, 21) + offset * 86_400_000).toISOString().slice(0, 10);
const TODAY = day(0);
const check = (p: Partial<DailyCheck> = {}): DailyCheck => ({
  id: 'c', date: TODAY, sleepHours: 7.5, sleepSource: 'manual', energy: 3, soreness: 2, stress: 2,
  cyclePhase: null, shareCycle: false, note: null, shareWithCoach: true, submittedAt: `${TODAY}T07:00:00Z`, ...p,
});

describe('training load', () => {
  it('uses minutes × session RPE from how it felt', () => {
    expect(sessionLoad(60, 1)).toBe(540);
    expect(sessionLoad(60, 5)).toBe(300);
    expect(sessionLoad(60, null)).toBe(420);
  });
  it('says nothing until there are 21 days of history', () => {
    expect(loadTrend([{ date: day(-10), load: 400 }, { date: day(0), load: 400 }], TODAY).status).toBe('unknown');
  });
  it('flags a spike when this week is 1.5× the 4-week average', () => {
    const steady = [-27, -24, -21, -17, -14, -10].map((d) => ({ date: day(d), load: 400 }));
    const spike = [-5, -3, -1, 0].map((d) => ({ date: day(d), load: 500 }));
    const t = loadTrend([...steady, ...spike], TODAY);
    expect(t.status).toBe('spike');
    expect(t.ratio).toBeGreaterThanOrEqual(1.5);
    expect(loadTrend([...steady, { date: day(-3), load: 400 }, { date: day(-1), load: 400 }], TODAY).status).toBe('steady');
  });
});

describe('sleep', () => {
  it('counts short nights by the fixed floor and by the athlete’s own baseline', () => {
    const base = [-16, -14, -12, -10, -8, -6, -4].map((d) => ({ date: day(d), sleepHours: 8.5 }));
    const p = sleepPattern([...base, { date: day(-2), sleepHours: 7.2 }, { date: day(-1), sleepHours: 6.0 }, { date: TODAY, sleepHours: 8.4 }], TODAY);
    expect(p.baseline).toBe(8.5);
    expect(p.shortNights).toBe(2); // 7.2 is over an hour under 8.5; 6.0 is under the floor
    expect(p.lastNight).toBe(8.4);
  });
});

describe('fuel', () => {
  it('needs two logged days and a target', () => {
    expect(fuelStatus([{ date: day(-1), kcal: 1200 }], 2400, TODAY)).toBe('unknown');
    expect(fuelStatus([{ date: day(-1), kcal: 1200 }, { date: day(-2), kcal: 1500 }], 2400, TODAY)).toBe('low');
    expect(fuelStatus([{ date: day(-1), kcal: 2300 }, { date: day(-2), kcal: 2100 }], 2400, TODAY)).toBe('ok');
    expect(fuelStatus([{ date: day(-1), kcal: 900 }, { date: day(-2), kcal: 900 }], null, TODAY)).toBe('unknown');
  });
});

describe('dailyRead', () => {
  const steadyLoad = { status: 'steady' as const, acute: 1000, chronicWeekly: 1000, ratio: 1 };
  it('is good to go with no strain', () => {
    const r = dailyRead({ today: TODAY, check: check(), history: [check()], load: steadyLoad, fuel: 'ok' });
    expect(r).toMatchObject({ tone: 'steady', headline: 'Good to train as planned', suggestLighter: false });
    expect(r.factors.map((f) => f.kind)).toEqual(['sleep_ok']);
  });
  it('says keep an eye on it with one strain factor', () => {
    const r = dailyRead({ today: TODAY, check: check({ soreness: 4 }), history: [check()], load: steadyLoad, fuel: 'ok' });
    expect(r.tone).toBe('watch');
    expect(r.headline).toBe('Train as planned, and keep an eye on it: feeling sore today');
  });
  it('suggests an easier day with two or more', () => {
    const hist = [{ date: day(-2), sleepHours: 5.9 }, { date: day(-1), sleepHours: 6.1 }, { date: TODAY, sleepHours: 7 }];
    const r = dailyRead({ today: TODAY, check: check({ sleepHours: 7, energy: 2 }), history: hist, load: steadyLoad, fuel: 'ok' });
    expect(r.tone).toBe('ease');
    expect(r.suggestLighter).toBe(true);
    expect(r.factors.filter((f) => f.strain).map((f) => f.kind)).toEqual(['sleep_short', 'energy_low']);
  });
  it('never counts the cycle phase as strain, and hides it from the coach unless shared', () => {
    const c = check({ cyclePhase: 'luteal' });
    const r = dailyRead({ today: TODAY, check: c, history: [c], load: steadyLoad, fuel: 'unknown' });
    expect(r.tone).toBe('steady');
    expect(sharedRead(r, c)!.factors.some((f) => f.kind === 'cycle_phase')).toBe(false);
    expect(sharedRead(r, { ...c, shareCycle: true })!.factors.some((f) => f.kind === 'cycle_phase')).toBe(true);
    expect(sharedRead(r, { ...c, shareWithCoach: false })).toBeNull();
  });
});

describe('lighter option', () => {
  it('cuts load and sets but keeps at least one set', () => {
    const ex = [{ name: 'Squat', sets: [{ loadKg: 100 }, { loadKg: 100 }, { loadKg: 100 }] }, { name: 'Carry', sets: [{ loadKg: null }] }];
    const out = applyLighter(ex, { loadPct: 10, dropSets: 1 });
    expect(out[0]!.sets).toEqual([{ loadKg: 90 }, { loadKg: 90 }]);
    expect(out[1]!.sets).toEqual([{ loadKg: null }]);
  });
});

describe('memberRisk', () => {
  const base: MemberSignals = {
    weeks: [{ planned: 3, done: 3 }, { planned: 3, done: 3 }, { planned: 3, done: 3 }, { planned: 3, done: 3 }],
    daysSinceLastOpen: 1, daysSinceLastSession: 2, easeReadsRecent: 0, easeReadsBefore: 0, checkInsMissed: 0, paymentIssue: false, tenureDays: 300,
  };
  it('is low for an engaged member', () => {
    expect(memberRisk(base)).toEqual({ level: 'low', points: 0, reasons: [] });
  });
  it('is high when sessions fall away and the app goes quiet, with plain reasons', () => {
    const r = memberRisk({ ...base, weeks: [{ planned: 3, done: 3 }, { planned: 3, done: 2 }, { planned: 3, done: 1 }, { planned: 3, done: 0 }], daysSinceLastOpen: 9, daysSinceLastSession: 12 });
    expect(r.level).toBe('high');
    expect(r.reasons).toEqual(['Sessions fell from 83% to 17% of plan', 'No session in 12 days', 'Hasn’t opened the app in 9 days']);
  });
  it('weights new members a little higher', () => {
    // missed check-ins (1) + payment (2) = 3 → medium; in their first two months (+1) = 4, still medium
    expect(memberRisk({ ...base, checkInsMissed: 2, paymentIssue: true })).toMatchObject({ level: 'medium', points: 3 });
    expect(memberRisk({ ...base, checkInsMissed: 2, paymentIssue: true, tenureDays: 30 })).toMatchObject({ level: 'medium', points: 4 });
    expect(memberRisk({ ...base, daysSinceLastSession: 12, paymentIssue: true, tenureDays: 30 })).toMatchObject({ level: 'high', points: 5 });
  });
});

describe('interventionOutcome', () => {
  it('counts kept only after 60 days still active', () => {
    expect(interventionOutcome(day(-30), true, null, TODAY)).toBe('pending');
    expect(interventionOutcome(day(-61), true, null, TODAY)).toBe('kept');
    expect(interventionOutcome(day(-61), false, day(-5), TODAY)).toBe('left');
  });
});
