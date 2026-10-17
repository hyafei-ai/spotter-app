import type { ExerciseMetric } from './schemas';

/** Personal records (C-4 finish, C-9). Only real ones: a PR needs earlier history to beat. */

export type RecordType = 'heaviest' | 'e1rm' | 'most_reps';

export interface SetLike {
  exerciseId: string;
  weightKg: number | null;
  reps: number | null;
}

export interface PersonalRecord {
  exerciseId: string;
  type: RecordType;
  value: number;
  previous: number;
}

/** Epley; only trusted up to 12 reps. */
export function estimatedOneRepMax(weightKg: number, reps: number): number | null {
  if (reps < 1 || reps > 12 || weightKg <= 0) return null;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

interface Best {
  heaviest: number | null;
  e1rm: number | null;
  mostReps: number | null;
}

function best(sets: SetLike[], metric: ExerciseMetric): Best {
  const b: Best = { heaviest: null, e1rm: null, mostReps: null };
  for (const s of sets) {
    if (metric === 'bodyweight_reps') {
      if (s.reps != null) b.mostReps = Math.max(b.mostReps ?? 0, s.reps);
      continue;
    }
    if (metric !== 'weight_reps' || s.weightKg == null || s.reps == null || s.reps < 1) continue;
    b.heaviest = Math.max(b.heaviest ?? 0, s.weightKg);
    const e = estimatedOneRepMax(s.weightKg, s.reps);
    if (e != null) b.e1rm = Math.max(b.e1rm ?? 0, e);
  }
  return b;
}

const EPS = 1e-6;

export function detectRecords(
  exerciseId: string,
  metric: ExerciseMetric,
  history: SetLike[],
  today: SetLike[],
): PersonalRecord[] {
  const before = best(history.filter((s) => s.exerciseId === exerciseId), metric);
  const now = best(today.filter((s) => s.exerciseId === exerciseId), metric);
  const out: PersonalRecord[] = [];
  const check = (type: RecordType, prev: number | null, cur: number | null) => {
    if (prev == null || cur == null) return; // no baseline → no PR
    if (cur > prev + EPS) out.push({ exerciseId, type, value: cur, previous: prev });
  };
  check('heaviest', before.heaviest, now.heaviest);
  // An e1RM PR alongside a heaviest-weight PR says the same thing twice; keep the plainer one.
  if (!out.some((r) => r.type === 'heaviest')) check('e1rm', before.e1rm, now.e1rm);
  check('most_reps', before.mostReps, now.mostReps);
  return out;
}
