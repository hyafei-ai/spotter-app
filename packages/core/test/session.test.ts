import { describe, expect, it } from 'vitest';
import { LOWER_A, DEMO_HISTORY } from '../src/demo/client';
import { defaultEntry, describeTarget, indexLogged, nextSlot, performanceOrder, summarize } from '../src/session';
import { detectRecords, estimatedOneRepMax } from '../src/records';
import type { LoggedSet } from '../src/schemas';

describe('performanceOrder', () => {
  it('alternates supersets set by set and runs the rest straight through', () => {
    const order = performanceOrder(LOWER_A).map((s) => `${s.exercise.exerciseId}#${s.setIndex}`);
    expect(order.slice(0, 6)).toEqual(['back-squat#0', 'back-squat#1', 'back-squat#2', 'romanian-deadlift#0', 'romanian-deadlift#1', 'romanian-deadlift#2']);
    expect(order.slice(6, 12)).toEqual([
      'bulgarian-split-squat#0', 'hanging-knee-raise#0',
      'bulgarian-split-squat#1', 'hanging-knee-raise#1',
      'bulgarian-split-squat#2', 'hanging-knee-raise#2',
    ]);
    expect(order).toHaveLength(14);
  });
});

describe('session flow', () => {
  const squat = LOWER_A.exercises[0]!;
  const mk = (setIndex: number, weightKg: number, reps: number): LoggedSet => ({
    id: `0192f0a1-0000-7000-8000-0000000099${String(setIndex).padStart(2, '0')}`,
    sessionId: '0192f0a1-0000-7000-8000-000000009999',
    programExerciseId: squat.id,
    exerciseId: squat.exerciseId,
    setIndex,
    weightKg,
    reps,
    rpe: null,
    durationS: null,
    distanceM: null,
    loggedAt: '2026-10-17T17:40:00.000Z',
  });

  it('finds the next unlogged set, skipping ones logged out of order', () => {
    const logged = indexLogged([mk(0, 82.5, 8), mk(2, 82.5, 7)]);
    expect(nextSlot(LOWER_A, logged)?.setIndex).toBe(1);
  });

  it('prefills the suggested load and the top of the rep range', () => {
    expect(defaultEntry(squat, 0, undefined, 82.5)).toEqual({ weightKg: 82.5, reps: 8 });
    expect(defaultEntry(squat, 0, undefined, null)).toEqual({ weightKg: 80, reps: 8 });
  });

  it('summarises with real PRs and lists unlogged sets', () => {
    const history = DEMO_HISTORY.flatMap((s) => s.sets);
    const sum = summarize(LOWER_A, [mk(0, 82.5, 8), mk(1, 82.5, 8)], '2026-10-17T17:30:00.000Z', '2026-10-17T18:25:30.000Z', history);
    expect(sum.durationS).toBe(3330);
    expect(sum.setsLogged).toBe(2);
    expect(sum.unlogged).toHaveLength(12);
    expect(sum.volumeKg).toBe(1320);
    expect(sum.records).toEqual([{ exerciseId: 'back-squat', type: 'heaviest', value: 82.5, previous: 80, name: 'Back Squat' }]);
  });

  it('describes targets plainly', () => {
    expect(describeTarget(squat, 0)).toBe('5–8 @ RPE 8');
    expect(describeTarget(LOWER_A.exercises[4]!, 0)).toBe('40 m');
  });
});

describe('records', () => {
  it('never reports a PR without earlier history', () => {
    expect(detectRecords('back-squat', 'weight_reps', [], [{ exerciseId: 'back-squat', weightKg: 100, reps: 5 }])).toEqual([]);
  });

  it('reports an e1RM PR when the weight is not heavier', () => {
    const r = detectRecords('back-squat', 'weight_reps', [{ exerciseId: 'back-squat', weightKg: 80, reps: 8 }], [{ exerciseId: 'back-squat', weightKg: 80, reps: 10 }]);
    expect(r.map((x) => x.type)).toEqual(['e1rm']);
  });

  it('tracks rep PRs for bodyweight movements', () => {
    const r = detectRecords('pull-up', 'bodyweight_reps', [{ exerciseId: 'pull-up', weightKg: null, reps: 8 }], [{ exerciseId: 'pull-up', weightKg: null, reps: 9 }]);
    expect(r).toEqual([{ exerciseId: 'pull-up', type: 'most_reps', value: 9, previous: 8 }]);
  });

  it('bounds e1RM to 1–12 reps', () => {
    expect(estimatedOneRepMax(100, 1)).toBe(100);
    expect(estimatedOneRepMax(100, 13)).toBeNull();
    expect(estimatedOneRepMax(100, 5)).toBeCloseTo(116.667, 2);
  });
});
