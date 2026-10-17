import type { PrescribedSet, ProgressionRule } from './schemas';

/**
 * Smart progression (C-4). Rules are set by the coach per program exercise:
 * "+2.5 kg when the top of the rep range is hit at ≤ RPE 8 for 2 sessions".
 * Evaluated server-side after a session finishes (POST /progression/evaluate);
 * the same function runs on device so the logger can show the suggestion offline.
 */

export interface ExerciseSessionResult {
  /** Logged working sets for this exercise in one session, in set order. */
  sets: { weightKg: number | null; reps: number | null; rpe: number | null }[];
}

export interface ProgressionSuggestion {
  suggestedLoadKg: number;
  previousLoadKg: number;
  reason: string;
}

function hitsRule(result: ExerciseSessionResult, prescribed: PrescribedSet[], rule: ProgressionRule, loadKg: number): boolean {
  const working = prescribed.filter((p) => p.repsMax != null);
  if (working.length === 0) return false;
  // Every prescribed set must have been logged; skipping sets never earns a load increase.
  if (result.sets.length < working.length) return false;
  return working.every((p, i) => {
    const s = result.sets[i];
    if (!s || s.reps == null || s.weightKg == null) return false;
    if (s.weightKg + 1e-6 < loadKg) return false;
    if (s.reps < (p.repsMax ?? Infinity)) return false;
    if (rule.maxRpe != null) {
      // An unrecorded RPE can't prove the set was within the limit, so it doesn't count.
      if (s.rpe == null || s.rpe > rule.maxRpe) return false;
    }
    return true;
  });
}

/**
 * @param history results for this program exercise, oldest first
 * @param currentLoadKg the load currently prescribed
 */
export function evaluateProgression(
  rule: ProgressionRule,
  prescribed: PrescribedSet[],
  history: ExerciseSessionResult[],
  currentLoadKg: number,
): ProgressionSuggestion | null {
  if (history.length < rule.sessionsRequired) return null;
  const recent = history.slice(-rule.sessionsRequired);
  if (!recent.every((r) => hitsRule(r, prescribed, rule, currentLoadKg))) return null;
  const top = prescribed.find((p) => p.repsMax != null)?.repsMax;
  const rpeText = rule.maxRpe != null ? ` at RPE ${rule.maxRpe} or easier` : '';
  const sessions = rule.sessionsRequired === 1 ? 'last session' : `${rule.sessionsRequired} sessions in a row`;
  return {
    suggestedLoadKg: Math.round((currentLoadKg + rule.incrementKg) * 1000) / 1000,
    previousLoadKg: currentLoadKg,
    reason: `You hit ${top} reps on every set${rpeText}, ${sessions}.`,
  };
}
