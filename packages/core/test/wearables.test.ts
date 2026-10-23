import { describe, expect, it } from 'vitest';
import { dedupeImported, groupFlowDays, hrvStatus, importedWorkoutLoad, maxObservedHr, restingHrStatus } from '../src/wearables';
import { demoImportedWorkouts, demoWearableDays } from '../src/demo/wearables';
import type { ImportedWorkout, WearableDay } from '../src/physiology';

const day = (offset: number, patch: Partial<WearableDay> = {}): WearableDay => {
  const d = new Date(Date.UTC(2026, 9, 23) + offset * 86_400_000).toISOString().slice(0, 10);
  return { date: d, sleepHours: null, hrvMs: null, restingHr: null, activeKcal: null, source: 'apple_health', ...patch };
};
const TODAY = '2026-10-23';
const steady = (n: number, hrv: number[], rhr = 58, source: WearableDay['source'] = 'apple_health') =>
  Array.from({ length: n }, (_, i) => day(-(i + 1), { hrvMs: hrv[i % hrv.length]!, restingHr: rhr, source }));

describe('hrvStatus', () => {
  it('is unknown with fewer than 7 prior readings', () => {
    const s = hrvStatus([...steady(6, [50]), day(0, { hrvMs: 30 })], TODAY);
    expect(s.status).toBe('unknown');
    expect(s.readings).toBe(6);
  });

  it('is low more than 1 SD under the athlete’s own baseline', () => {
    const s = hrvStatus([...steady(10, [46, 50, 54]), day(0, { hrvMs: 41 })], TODAY);
    expect(s.status).toBe('low');
    expect(s.deltaPct).toBeLessThan(-10);
    expect(s.source).toBe('apple_health');
  });

  it('is normal within 1 SD', () => {
    expect(hrvStatus([...steady(10, [46, 50, 54]), day(0, { hrvMs: 48 })], TODAY).status).toBe('normal');
  });

  it('never compares Apple Health SDNN with Health Connect RMSSD', () => {
    const days = [...steady(10, [30], 58, 'health_connect'), day(0, { hrvMs: 48, source: 'apple_health' })];
    expect(hrvStatus(days, TODAY).status).toBe('unknown');
  });

  it('ignores readings older than 28 days', () => {
    const old = Array.from({ length: 10 }, (_, i) => day(-(30 + i), { hrvMs: 80 }));
    expect(hrvStatus([...old, day(0, { hrvMs: 40 })], TODAY).status).toBe('unknown');
  });
});

describe('restingHrStatus', () => {
  it('is high at 5 bpm over baseline', () => {
    expect(restingHrStatus([...steady(10, [50], 58), day(0, { restingHr: 63 })], TODAY).status).toBe('high');
    expect(restingHrStatus([...steady(10, [50], 58), day(0, { restingHr: 62 })], TODAY).status).toBe('normal');
  });
});

describe('demo wearable days (MOCK)', () => {
  it('end with HRV low and resting HR high', () => {
    const now = new Date(2026, 9, 23, 9);
    const days = demoWearableDays(now);
    expect(days).toHaveLength(28);
    expect(days[27]!.date).toBe('2026-10-23');
    expect(hrvStatus(days, '2026-10-23').status).toBe('low');
    expect(restingHrStatus(days, '2026-10-23').status).toBe('high');
    expect(demoWearableDays(now)).toEqual(days);
  });
});

describe('imported workouts', () => {
  const run = (patch: Partial<ImportedWorkout> = {}): ImportedWorkout => ({
    id: 'w1',
    date: TODAY,
    startedAt: `${TODAY}T07:00:00.000Z`,
    durationMin: 40,
    activity: 'run',
    activeKcal: 380,
    distanceM: 6000,
    avgHr: null,
    maxHr: null,
    source: 'apple_health',
    sourceApp: 'Workout',
    ...patch,
  });

  it('uses RPE 6 without heart rate, labelled as an estimate', () => {
    expect(importedWorkoutLoad(run(), null)).toEqual({ load: 240, rpe: 6, estimated: true, basis: 'default' });
  });

  it('estimates RPE from heart rate as a share of their own max', () => {
    const l = importedWorkoutLoad(run({ avgHr: 160 }), 175);
    expect(l.basis).toBe('heart_rate');
    expect(l.rpe).toBe(8);
    expect(l.load).toBe(320);
    expect(maxObservedHr(demoImportedWorkouts(new Date(2026, 9, 23)))).toBe(172);
  });

  it('treats a workout overlapping a Spotter session by more than half as the same session', () => {
    const w = [run({ id: 'a', startedAt: `${TODAY}T17:40:00.000Z`, durationMin: 50, avgHr: 120 }), run({ id: 'b' })];
    const r = dedupeImported(w, [{ sessionId: 's1', startedAt: `${TODAY}T17:30:00.000Z`, finishedAt: `${TODAY}T18:30:00.000Z` }]);
    expect(r.separate.map((x) => x.id)).toEqual(['b']);
    expect(r.attached.s1).toMatchObject({ id: 'a', avgHr: 120 });
  });

  it('keeps a workout that only brushes a session', () => {
    const w = [run({ id: 'a', startedAt: `${TODAY}T18:10:00.000Z`, durationMin: 60 })];
    const r = dedupeImported(w, [{ sessionId: 's1', startedAt: `${TODAY}T17:30:00.000Z`, finishedAt: `${TODAY}T18:30:00.000Z` }]);
    expect(r.separate).toHaveLength(1);
  });
});

describe('groupFlowDays', () => {
  it('groups consecutive flow days (allowing a one-day gap) into periods', () => {
    expect(groupFlowDays(['2026-09-01', '2026-09-02', '2026-09-04', '2026-09-29', '2026-09-30', '2026-09-02'])).toEqual([
      { start: '2026-09-01', end: '2026-09-04' },
      { start: '2026-09-29', end: '2026-09-30' },
    ]);
    expect(groupFlowDays([])).toEqual([]);
  });
});
