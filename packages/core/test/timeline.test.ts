import { describe, expect, it } from 'vitest';
import { buildTimeline, mainMuscleGroup, rosterCell, type ClientDay, type TimelineSessionInput } from '../src/timeline';
import { phaseOnFor } from '../src/cycle';
import type { CycleProfile, ImportedWorkout, WearableDay } from '../src/physiology';

const DAY = 86_400_000;
const add = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const FROM = '2026-09-01';

function squat(date: string, kg: number, over: Partial<TimelineSessionInput> = {}): TimelineSessionInput {
  return { date, feel: 4, sets: [0, 1, 2].map(() => ({ exerciseId: 'back-squat', weightKg: kg, reps: 5, rpe: null })), ...over };
}

function wearables(days: number, hrv: (i: number) => number, sleep = 7.5): WearableDay[] {
  return Array.from({ length: days }, (_, i) => ({ date: add(FROM, i), sleepHours: sleep, hrvMs: hrv(i), restingHr: 58, activeKcal: 400, source: 'apple_health' as const }));
}

const run = (date: string, over: Partial<ImportedWorkout> = {}): ImportedWorkout => ({
  id: `w-${date}`,
  date,
  startedAt: `${date}T06:30:00`,
  durationMin: 30,
  activity: 'run',
  activeKcal: 300,
  distanceM: 5000,
  avgHr: 150,
  maxHr: 170,
  source: 'apple_health',
  sourceApp: 'Strava',
  ...over,
});

describe('buildTimeline', () => {
  it('returns one day per date, oldest first', () => {
    const days = buildTimeline({ sessions: [] }, FROM, add(FROM, 6));
    expect(days.map((d) => d.date)).toEqual(Array.from({ length: 7 }, (_, i) => add(FROM, i)));
    expect(buildTimeline({ sessions: [] }, add(FROM, 2), FROM)).toEqual([]);
  });

  it('builds training from Spotter sessions: load, hard sets, muscles, hour, relative performance', () => {
    const sessions = [0, 2, 4, 6].map((i) => squat(add(FROM, i), 100, { title: 'Lower A', durationMin: 60, startedAt: `${add(FROM, i)}T18:05:00` }));
    sessions.push(squat(add(FROM, 8), 95, { title: 'Lower A', durationMin: 60 }));
    const days = buildTimeline({ sessions }, FROM, add(FROM, 8));
    const s = days[0]!.training.sessions[0]!;
    expect(s).toMatchObject({ source: 'spotter', title: 'Lower A', minutes: 60, load: 360, hardSets: 3, muscles: ['legs'], rpe: 6, hour: 18 });
    expect(s.deltaPct).toBeNull(); // no baseline yet
    expect(s.bests!['back-squat']).toBeCloseTo(116.7, 1);
    expect(days[8]!.training.sessions[0]!.deltaPct).toBe(-5);
    expect(days[1]!.training).toEqual({ sessions: [], load: 0 });
  });

  it('estimates minutes from sets when no duration was recorded', () => {
    const [d] = buildTimeline({ sessions: [squat(FROM, 100)] }, FROM, FROM);
    expect(d!.training.sessions[0]!.minutes).toBe(8); // 3 sets × 2.5 min
  });

  it('counts sets with RPE under 7 as not hard', () => {
    const s = squat(FROM, 100);
    s.sets[0]!.rpe = 5;
    s.sets[1]!.rpe = 8;
    const [d] = buildTimeline({ sessions: [s] }, FROM, FROM);
    expect(d!.training.sessions[0]!.hardSets).toBe(2);
    expect(d!.training.sessions[0]!.rpe).toBe(6.5);
  });

  it('adds imported workouts, skips ones that are the same Spotter session, and treats yoga as mobility', () => {
    const sessions = [squat(FROM, 100, { id: 's1', startedAt: `${FROM}T18:00:00.000Z`, durationMin: 60 })];
    const imported = [
      run(FROM, { id: 'dup', startedAt: `${FROM}T18:05:00.000Z`, activity: 'strength', durationMin: 50 }),
      run(add(FROM, 1)),
      run(add(FROM, 2), { id: 'yoga', activity: 'yoga', durationMin: 40 }),
    ];
    const days = buildTimeline({ sessions, imported }, FROM, add(FROM, 2));
    expect(days[0]!.training.sessions).toHaveLength(1);
    expect(days[1]!.training.sessions[0]).toMatchObject({ source: 'imported', title: 'Run · Strava', minutes: 30, hardSets: 0 });
    expect(days[1]!.training.load).toBeGreaterThan(0);
    expect(days[2]!.training.sessions).toHaveLength(0);
    expect(days[2]!.mobility).toEqual({ minutes: 40, sessions: 1 });
  });

  it('reads recovery against the client’s own baseline', () => {
    const w = wearables(30, (i) => (i === 29 ? 40 : 50 + (i % 2)));
    const days = buildTimeline({ sessions: [], wearables: w }, add(FROM, 28), add(FROM, 29));
    expect(days[0]!.recovery).toMatchObject({ sleepHours: 7.5, hrvMs: 50, hrvLow: false, restingHr: 58, rhrVsBaseline: 0 });
    expect(days[1]!.recovery.hrvVsBaseline).toBeCloseTo(0.79, 2);
    expect(days[1]!.recovery.hrvLow).toBe(true);
    const early = buildTimeline({ sessions: [], wearables: w }, FROM, FROM)[0]!;
    expect(early.recovery.hrvVsBaseline).toBeNull();
    expect(early.recovery.hrvLow).toBeNull();
  });

  it('falls back to the daily check for sleep, and carries the check', () => {
    const [d] = buildTimeline({ sessions: [], checks: [{ date: FROM, sleepHours: 6, energy: 2, soreness: 4, stress: 3 }] }, FROM, FROM);
    expect(d!.recovery.sleepHours).toBe(6);
    expect(d!.check).toEqual({ energy: 2, soreness: 4, stress: 3 });
  });

  it('uses one food source per day: the health app first, else Spotter, never summed', () => {
    const days = buildTimeline(
      {
        sessions: [],
        healthNutrition: [{ date: FROM, kcal: 1800, proteinG: 120, carbsG: 200, fatG: 60, sources: ['MyMacros'] }],
        spotterNutrition: [
          { date: FROM, kcal: 500, proteinG: 30, carbsG: 50, fatG: 10 },
          { date: add(FROM, 1), kcal: 1500, proteinG: 90, carbsG: 150, fatG: 50 },
        ] as never,
        targets: { kcal: 2000, carbsG: 250 },
      },
      FROM,
      add(FROM, 2),
    );
    expect(days[0]!.nutrition).toEqual({ kcal: 1800, proteinG: 120, carbsG: 200, vsTarget: 0.9, carbsVsTarget: 0.8, source: 'From MyMacros via Apple Health' });
    expect(days[1]!.nutrition).toMatchObject({ kcal: 1500, vsTarget: 0.75, source: 'Logged in Spotter' });
    expect(days[2]!.nutrition).toMatchObject({ kcal: null, vsTarget: null, source: null });
  });

  it('includes the cycle only when the caller passes it', () => {
    const profile: CycleProfile = { mode: 'natural', periods: [0, 28, 56].map((o) => ({ start: add('2026-07-01', o), end: add('2026-07-01', o + 4) })), birthYear: 1985, shareWithCoach: true };
    expect(buildTimeline({ sessions: [] }, FROM, FROM)[0]!.cycle).toBeNull();
    const [d] = buildTimeline({ sessions: [], phaseOn: phaseOnFor(profile) }, FROM, FROM);
    expect(d!.cycle).toEqual({ phase: expect.any(String), day: 7 });
  });

  it('lists pain above 0 for the day', () => {
    const [d] = buildTimeline(
      {
        sessions: [],
        pain: [
          { id: 'a', date: FROM, region: 'knee', side: 'left', level: 4, note: null },
          { id: 'b', date: FROM, region: 'hip', side: null, level: 0, note: null },
        ],
      },
      FROM,
      FROM,
    );
    expect(d!.pain).toEqual([{ region: 'knee', level: 4 }]);
  });

  it('merges logged and imported mobility', () => {
    const days = buildTimeline(
      {
        sessions: [],
        mobility: [{ id: 'm1', date: FROM, minutes: 10, kind: 'routine', source: 'spotter', routineId: null }],
        imported: [run(FROM, { id: 'st', activity: 'flexibility', durationMin: 15 })],
      },
      FROM,
      FROM,
    );
    expect(days[0]!.mobility).toEqual({ minutes: 25, sessions: 2 });
  });
});

describe('mainMuscleGroup', () => {
  it('maps library exercises to their main group', () => {
    expect(mainMuscleGroup('back-squat')).toBe('legs');
    expect(mainMuscleGroup('deadlift')).toBe('posterior chain');
    expect(mainMuscleGroup('bench-press')).toBe('push');
    expect(mainMuscleGroup('lat-pulldown')).toBe('pull');
    expect(mainMuscleGroup('farmer-carry')).toBeNull();
    expect(mainMuscleGroup('my-custom')).toBeNull();
  });
});

describe('rosterCell', () => {
  const base = (): ClientDay => buildTimeline({ sessions: [] }, FROM, FROM)[0]!;

  it('is empty with nothing to read', () => {
    expect(rosterCell(base())).toEqual({ trained: false, tone: null, flags: [] });
  });

  it('steady with good data, trained when there was a session', () => {
    const d = base();
    d.recovery.sleepHours = 7.8;
    d.training.sessions = [{ source: 'spotter', title: 'A', minutes: 60, load: 360, hardSets: 9, rpe: 6 }];
    expect(rosterCell(d)).toEqual({ trained: true, tone: 'steady', flags: [] });
  });

  it('watch with one strain, ease with two, flags named', () => {
    const d = base();
    d.recovery.sleepHours = 5.5;
    expect(rosterCell(d)).toEqual({ trained: false, tone: 'watch', flags: ['short_sleep'] });
    d.recovery.hrvLow = true;
    d.nutrition.vsTarget = 0.6;
    d.pain = [{ region: 'knee', level: 2 }];
    expect(rosterCell(d)).toEqual({ trained: false, tone: 'ease', flags: ['short_sleep', 'low_hrv', 'pain', 'under_fuelled'] });
  });

  it('counts check answers and resting HR as strain', () => {
    const d = base();
    d.check = { energy: 2, soreness: 4, stress: 2 };
    expect(rosterCell(d).tone).toBe('ease');
    const e = base();
    e.recovery.rhrVsBaseline = 6;
    e.recovery.restingHr = 64;
    expect(rosterCell(e).tone).toBe('watch');
  });
});
