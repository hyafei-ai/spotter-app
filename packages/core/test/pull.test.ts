import { describe, expect, it } from 'vitest';
import { nextPlanFromPull, type PulledRows } from '../src/pull';

const id = (n: number) => `0192f0a3-0000-7000-8000-${String(n).padStart(12, '0')}`;

const rows = (): PulledRows => ({
  assignments: [{ program_id: id(1), start_date: '2026-10-01', status: 'active' }],
  program_weeks: [
    { id: id(11), program_id: id(1), week_index: 1 },
    { id: id(10), program_id: id(1), week_index: 0 },
  ],
  program_days: [
    { id: id(21), program_id: id(1), week_id: id(10), day_index: 1, title: 'Upper A', coach_note: null },
    { id: id(20), program_id: id(1), week_id: id(10), day_index: 0, title: 'Lower A', coach_note: 'Brace.' },
    { id: id(22), program_id: id(1), week_id: id(11), day_index: 0, title: 'Lower B', coach_note: null },
  ],
  program_exercises: [
    { id: id(31), program_day_id: id(20), exercise_id: 'back-squat', position: 0, superset_group: null, metric: 'weight_reps', rest_s: 150, tempo: null, note: null, track_rpe: true, alternatives: ['safety-bar-squat'] },
    { id: id(32), program_day_id: id(21), exercise_id: 'bench', position: 0, superset_group: null, metric: 'weight_reps', rest_s: 120, tempo: null, note: null, track_rpe: false, alternatives: [] },
  ],
  prescribed_sets: [
    { program_exercise_id: id(31), set_index: 1, reps_min: 5, reps_max: 8, load_type: 'absolute', load_value: 80, rpe: 8, duration_s: null, distance_m: null, amrap: false },
    { program_exercise_id: id(31), set_index: 0, reps_min: 5, reps_max: 8, load_type: 'absolute', load_value: 80, rpe: 8, duration_s: null, distance_m: null, amrap: false },
    { program_exercise_id: id(32), set_index: 0, reps_min: 8, reps_max: 8, load_type: 'pct_1rm', load_value: 0.7, rpe: null, duration_s: null, distance_m: null, amrap: false },
  ],
  progression_rules: [{ id: id(41), program_exercise_id: id(31), condition: { maxRpe: 8 }, increment: 5, unit: 'lb', sessions_required: 2 }],
  exercises: [
    { id: 'back-squat', name: 'Back Squat' },
    { id: 'safety-bar-squat', name: 'Safety Bar Squat' },
  ],
  sessions: [],
});

describe('nextPlanFromPull', () => {
  it('starts at week 1 day 1 and maps exercises, sets and rules', () => {
    const p = nextPlanFromPull(rows(), '2026-10-21')!;
    expect(p.title).toBe('Lower A');
    expect(p.coachNote).toBe('Brace.');
    const e = p.exercises[0]!;
    expect(e).toMatchObject({ name: 'Back Squat', trackRpe: true, alternatives: [{ exerciseId: 'safety-bar-squat', name: 'Safety Bar Squat' }] });
    expect(e.sets.map((s) => s.index)).toEqual([0, 1]);
    expect(e.progressionRule?.incrementKg).toBeCloseTo(2.268, 3);
  });

  it('moves on to the next unfinished day, across weeks', () => {
    const r = rows();
    r.sessions = [{ program_day_id: id(20), finished_at: '2026-10-20T18:00:00Z' }];
    expect(nextPlanFromPull(r, '2026-10-21')?.title).toBe('Upper A');
    r.sessions.push({ program_day_id: id(21), finished_at: '2026-10-21T18:00:00Z' });
    expect(nextPlanFromPull(r, '2026-10-22')?.title).toBe('Lower B');
  });

  it('leaves %1RM loads for the logger to fill from history', () => {
    const r = rows();
    r.sessions = [{ program_day_id: id(20), finished_at: '2026-10-20T18:00:00Z' }];
    expect(nextPlanFromPull(r, '2026-10-21')?.exercises[0]?.sets[0]?.loadKg).toBeNull();
  });

  it('returns null with no active assignment, a future start, or a finished program', () => {
    expect(nextPlanFromPull({ ...rows(), assignments: [] }, '2026-10-21')).toBeNull();
    expect(nextPlanFromPull(rows(), '2026-09-30')).toBeNull();
    const r = rows();
    r.sessions = [id(20), id(21), id(22)].map((d) => ({ program_day_id: d, finished_at: '2026-10-20T18:00:00Z' }));
    expect(nextPlanFromPull(r, '2026-10-21')).toBeNull();
  });
});
