import { detectRecords, type PersonalRecord, type SetLike } from './records';
import type { LoggedSet, ProgramExercise, SessionPlan } from './schemas';

/** Pure model of a workout in progress. The app persists LoggedSets; this derives everything else. */

export type SetKey = `${string}:${number}`;
export const setKey = (programExerciseId: string, setIndex: number): SetKey => `${programExerciseId}:${setIndex}`;

export interface SetSlot {
  exercise: ProgramExercise;
  setIndex: number;
  key: SetKey;
}

/**
 * The order sets are performed in. Exercises sharing a supersetGroup alternate set by set
 * (A1, B1, A2, B2, …); everything else runs straight through.
 */
export function performanceOrder(plan: SessionPlan): SetSlot[] {
  const out: SetSlot[] = [];
  const ex = plan.exercises;
  for (let i = 0; i < ex.length; ) {
    const first = ex[i]!;
    const group = first.supersetGroup;
    let j = i + 1;
    if (group) while (j < ex.length && ex[j]!.supersetGroup === group) j++;
    const block = ex.slice(i, j);
    const rounds = Math.max(...block.map((e) => e.sets.length));
    for (let r = 0; r < rounds; r++) {
      for (const e of block) {
        const s = e.sets[r];
        if (s) out.push({ exercise: e, setIndex: s.index, key: setKey(e.id, s.index) });
      }
    }
    i = j;
  }
  return out;
}

export function indexLogged(sets: LoggedSet[]): Map<SetKey, LoggedSet> {
  return new Map(sets.map((s) => [setKey(s.programExerciseId, s.setIndex), s]));
}

export function nextSlot(plan: SessionPlan, logged: Map<SetKey, LoggedSet>): SetSlot | null {
  return performanceOrder(plan).find((slot) => !logged.has(slot.key)) ?? null;
}

export function countPlannedSets(plan: SessionPlan): number {
  return plan.exercises.reduce((n, e) => n + e.sets.length, 0);
}

export function volumeKg(sets: LoggedSet[]): number {
  return sets.reduce((v, s) => v + (s.weightKg ?? 0) * (s.reps ?? 0), 0);
}

export interface SessionSummary {
  durationS: number;
  setsLogged: number;
  setsPlanned: number;
  unlogged: SetSlot[];
  volumeKg: number;
  records: (PersonalRecord & { name: string })[];
}

export function summarize(
  plan: SessionPlan,
  logged: LoggedSet[],
  startedAt: string,
  finishedAt: string,
  history: SetLike[],
): SessionSummary {
  const map = indexLogged(logged);
  const records = plan.exercises.flatMap((e) =>
    detectRecords(e.exerciseId, e.metric, history, logged.filter((s) => s.programExerciseId === e.id)).map((r) => ({
      ...r,
      name: e.name,
    })),
  );
  return {
    durationS: Math.max(0, (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000),
    setsLogged: map.size,
    setsPlanned: countPlannedSets(plan),
    unlogged: performanceOrder(plan).filter((s) => !map.has(s.key)),
    volumeKg: volumeKg(logged),
    records,
  };
}

/** Values the entry steppers start at: suggested load, else target, else what was done last time. */
export function defaultEntry(
  exercise: ProgramExercise,
  setIndex: number,
  previous: LoggedSet | undefined,
  suggestedLoadKg: number | null,
): { weightKg: number | null; reps: number | null } {
  const p = exercise.sets.find((s) => s.index === setIndex);
  const weightKg =
    exercise.metric === 'weight_reps' ? (suggestedLoadKg ?? p?.loadKg ?? previous?.weightKg ?? 0) : null;
  const reps =
    exercise.metric === 'weight_reps' || exercise.metric === 'bodyweight_reps'
      ? (p?.repsMax ?? p?.repsMin ?? previous?.reps ?? 0)
      : null;
  return { weightKg, reps };
}

export function describeTarget(e: ProgramExercise, setIndex: number): string {
  const p = e.sets.find((s) => s.index === setIndex);
  if (!p) return '';
  if (e.metric === 'time') return `${p.durationS ?? 0} s`;
  if (e.metric === 'distance') return `${p.distanceM ?? 0} m`;
  const reps = p.amrap
    ? 'AMRAP'
    : p.repsMin != null && p.repsMax != null && p.repsMin !== p.repsMax
      ? `${p.repsMin}–${p.repsMax}`
      : String(p.repsMax ?? p.repsMin ?? '');
  return p.rpe != null ? `${reps} @ RPE ${p.rpe}` : reps;
}
