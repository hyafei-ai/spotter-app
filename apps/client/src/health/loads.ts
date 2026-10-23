import { activityExerciseId, dedupeImported, importedWorkoutLoad, maxObservedHr, type ImportedWorkout, type InjurySession } from '@spotter/core';
import type { CompletedSession } from '../store';

/**
 * Imported workouts as training load. A workout that overlaps a Spotter session by more than half its
 * time is that session (Spotter's log wins), so it never counts twice. Load is an estimate (minutes ×
 * an RPE guessed from heart rate, else 6), labelled as such wherever it's shown.
 */
export function importedSessions(workouts: ImportedWorkout[], completed: CompletedSession[]): (InjurySession & { workout: ImportedWorkout })[] {
  if (!workouts.length) return [];
  const { separate } = dedupeImported(
    workouts,
    completed.map((s) => ({ sessionId: s.sessionId, startedAt: s.startedAt, finishedAt: s.finishedAt })),
  );
  const max = maxObservedHr(workouts);
  return separate.map((w) => ({
    date: w.date,
    load: importedWorkoutLoad(w, max).load,
    sets: [{ exerciseId: activityExerciseId(w.activity) }],
    workout: w,
  }));
}
