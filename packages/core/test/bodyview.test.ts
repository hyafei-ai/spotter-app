import { describe, expect, it } from 'vitest';
import {
  cycleRingSegments,
  firstPerson,
  hrvRead,
  recentSeries,
  recoveryHeadline,
  restingHrRead,
  shareCardFor,
  sleepRead,
  weekMinutes,
} from '../src/bodyview';
import type { WearableDay } from '../src/physiology';
import { demoWearableDays } from '../src/demo/wearables';
import { Mutation } from '../src/schemas';

const DAY = 86_400_000;
const add = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const TODAY = '2026-10-23';

const day = (ago: number, over: Partial<WearableDay> = {}): WearableDay => ({
  date: add(TODAY, -ago),
  sleepHours: 7.5,
  hrvMs: 50 + (ago % 3),
  restingHr: 58 + (ago % 2),
  activeKcal: null,
  source: 'apple_health',
  ...over,
});

describe('recentSeries', () => {
  it('gives one value per day, oldest first, null for gaps, and prefers watch data over typed', () => {
    const days = [day(0, { sleepHours: 6 }), day(0, { sleepHours: 9, source: 'manual' }), day(2)];
    expect(recentSeries(days, TODAY, 3, (d) => d.sleepHours)).toEqual([7.5, null, 6]);
  });
});

describe('sleepRead', () => {
  it('waits for a week of nights before naming a usual', () => {
    const r = sleepRead([0, 1, 2].map((a) => day(a)), TODAY);
    expect(r.usual).toBeNull();
    expect(r.line).toContain('after a week');
    expect(r.nights).toHaveLength(14);
  });
  it('calls out a short night against the person’s own usual', () => {
    const days = [day(0, { sleepHours: 5.5 }), ...Array.from({ length: 20 }, (_, i) => day(i + 1))];
    const r = sleepRead(days, TODAY);
    expect(r.usual).toBe(7.5);
    expect(r.line).toBe('Short night: 5.5 h, about 2 h under your usual.');
  });
  it('says so when there is nothing', () => {
    expect(sleepRead([], TODAY).line).toBe('No sleep recorded yet.');
  });
});

describe('hrv and resting HR reads', () => {
  it('lead with plain words and keep the numbers separate', () => {
    const days = [day(0, { hrvMs: 30, restingHr: 70 }), ...Array.from({ length: 20 }, (_, i) => day(i + 1))];
    const h = hrvRead(days, TODAY);
    expect(h.plain.startsWith('Under your usual')).toBe(true);
    expect(h.plain).not.toMatch(/\d/);
    expect(h.numbers).toContain('30 ms today');
    expect(h.band).not.toBeNull();
    const r = restingHrRead(days, TODAY);
    expect(r.plain).toMatch(/^Higher than usual today/);
    expect(recoveryHeadline(sleepRead(days, TODAY), h, r)).toBe('Recovering less than usual');
  });
  it('reads the demo as a tired day', () => {
    const now = new Date();
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    const days = demoWearableDays(now);
    expect(hrvRead(days, today).status.status).toBe('low');
  });
});

describe('cycleRingSegments', () => {
  it('counts back from the next start like estimateCycle', () => {
    const { length, segments } = cycleRingSegments({ typicalLength: 29 });
    expect(length).toBe(29);
    expect(segments.find((s) => s.phase === 'luteal')).toEqual({ phase: 'luteal', from: 17, to: 29 });
    expect(segments.find((s) => s.phase === 'ovulation')).toEqual({ phase: 'ovulation', from: 14, to: 16 });
    expect(segments[0]).toEqual({ phase: 'menstrual', from: 1, to: 5 });
  });
});

describe('weekMinutes', () => {
  it('sums the last 7 days only', () => {
    const w = weekMinutes([{ date: TODAY, minutes: 10 }, { date: add(TODAY, -6), minutes: 20 }, { date: add(TODAY, -7), minutes: 99 }], TODAY);
    expect(w.total).toBe(30);
    expect(w.days[6]).toBe(10);
    expect(w.days[0]).toBe(20);
    expect(w.sessions).toBe(2);
  });
});

describe('share a win', () => {
  it('turns the win into the first person with the coach’s name', () => {
    expect(firstPerson('Held your Back Squat strength for 22 weeks')).toBe('Held my Back Squat strength for 22 weeks');
    const c = shareCardFor({ kind: 'holding_strong', text: 'Held your Back Squat strength for 22 weeks' }, 'Maya Reyes', 'Reyes Strength');
    expect(c.text).toBe('Held my Back Squat strength for 22 weeks. Coached by Maya Reyes · Reyes Strength');
    expect(c.includesHealthData).toBe(false);
  });
  it('flags wins built from health data', () => {
    expect(shareCardFor({ kind: 'resting_hr', text: 'Resting HR down 3 bpm in 8 weeks' }, 'Maya Reyes', 'X').includesHealthData).toBe(true);
  });
});

describe('who sees what: mobility sharing', () => {
  const base = { clientMutationId: '01900000-0000-7000-8000-000000009201', createdAt: '2026-10-24T08:00:00Z' };
  it('mobility.share.set is a sync mutation, and a log may carry its share flag', () => {
    expect(Mutation.safeParse({ ...base, kind: 'mobility.share.set', payload: { shareWithCoach: false, updatedAt: '2026-10-24T08:00:00Z' } }).success).toBe(true);
    expect(Mutation.safeParse({ ...base, kind: 'mobility.share.set', payload: { shareWithCoach: 'no', updatedAt: '2026-10-24T08:00:00Z' } }).success).toBe(false);
    const log = { mobilityId: '01900000-0000-7000-8000-0000000092a1', date: '2026-10-24', minutes: 10, kind: 'stretching', routineId: null, loggedAt: '2026-10-24T08:00:00Z' };
    expect(Mutation.safeParse({ ...base, kind: 'mobility.log', payload: { ...log, shareWithCoach: false } }).success).toBe(true);
    expect(Mutation.safeParse({ ...base, kind: 'mobility.log', payload: log }).success).toBe(true);
  });
});
