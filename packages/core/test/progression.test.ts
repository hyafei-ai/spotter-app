import { describe, expect, it } from 'vitest';
import { evaluateProgression, type ExerciseSessionResult } from '../src/progression';
import type { PrescribedSet, ProgressionRule } from '../src/schemas';

const rule: ProgressionRule = { id: '0192f0a1-0000-7000-8000-000000000901', maxRpe: 8, sessionsRequired: 2, incrementKg: 2.5 };
const prescribed: PrescribedSet[] = [0, 1, 2].map((index) => ({
  index, repsMin: 5, repsMax: 8, loadKg: 80, rpe: 8, durationS: null, distanceM: null, amrap: false,
}));
const session = (reps: number[], rpe: (number | null)[], w = 80): ExerciseSessionResult => ({
  sets: reps.map((r, i) => ({ weightKg: w, reps: r, rpe: rpe[i] ?? null })),
});

describe('evaluateProgression', () => {
  it('suggests +2.5 kg after two sessions at the top of the range within RPE', () => {
    const s = evaluateProgression(rule, prescribed, [session([8, 8, 8], [7, 7.5, 8]), session([8, 8, 8], [7, 8, 8])], 80);
    expect(s).toMatchObject({ suggestedLoadKg: 82.5, previousLoadKg: 80 });
    expect(s?.reason).toBe('You hit 8 reps on every set at RPE 8 or easier, 2 sessions in a row.');
  });

  it('needs the full number of sessions', () => {
    expect(evaluateProgression(rule, prescribed, [session([8, 8, 8], [7, 7, 7])], 80)).toBeNull();
  });

  it('only looks at the most recent sessions', () => {
    const old = session([6, 6, 5], [9, 9, 10]);
    const good = session([8, 8, 8], [8, 8, 8]);
    expect(evaluateProgression(rule, prescribed, [old, good, good], 80)).not.toBeNull();
    expect(evaluateProgression(rule, prescribed, [good, old], 80)).toBeNull();
  });

  it('does not count a set above the RPE limit', () => {
    expect(evaluateProgression(rule, prescribed, [session([8, 8, 8], [8, 8, 8.5]), session([8, 8, 8], [8, 8, 8])], 80)).toBeNull();
  });

  it('does not count sets with no RPE recorded when the rule needs one', () => {
    expect(evaluateProgression(rule, prescribed, [session([8, 8, 8], [8, null, 8]), session([8, 8, 8], [8, 8, 8])], 80)).toBeNull();
  });

  it('ignores RPE when the rule has no limit', () => {
    const r = { ...rule, maxRpe: null };
    expect(evaluateProgression(r, prescribed, [session([8, 8, 8], []), session([8, 8, 8], [])], 80)?.suggestedLoadKg).toBe(82.5);
  });

  it('needs every prescribed set logged', () => {
    expect(evaluateProgression(rule, prescribed, [session([8, 8], [7, 7]), session([8, 8, 8], [7, 7, 7])], 80)).toBeNull();
  });

  it('does not count sessions done at a lighter load', () => {
    expect(evaluateProgression(rule, prescribed, [session([8, 8, 8], [7, 7, 7], 77.5), session([8, 8, 8], [7, 7, 7])], 80)).toBeNull();
  });
});
