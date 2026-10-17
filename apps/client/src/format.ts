import { describeTarget, formatNumber, formatWeight, roundToIncrement, toDisplay, type LoggedSet, type ProgramExercise } from '@spotter/core';
import { tenant } from './env';

/** Logged weights: exactly as logged, in the tenant unit. */
export const w = (kg: number | null | undefined) => formatWeight(kg, tenant.units);

/** Prescribed loads: exact in kg tenants; rounded to the loadable increment when converted to lb. */
export const prescribed = (kg: number | null | undefined) =>
  formatWeight(kg, tenant.units, tenant.units === 'kg' ? 0 : tenant.weightIncrement);

/** Number only, for log-sheet cells whose column header carries the unit. */
export function loadNumber(kg: number, exact: boolean): string {
  const v = toDisplay(kg, tenant.units);
  return formatNumber(exact || tenant.units === 'kg' ? v : roundToIncrement(v, tenant.weightIncrement));
}

/** Target cell, e.g. "82.5 × 5–8", "× 12", "40 m". RPE is shown once in the exercise header. */
export function targetText(e: ProgramExercise, setIndex: number, loadKg: number | null): string {
  const reps = describeTarget({ ...e, sets: e.sets.map((p) => ({ ...p, rpe: null })) }, setIndex);
  if (e.metric === 'weight_reps' && loadKg != null) return `${loadNumber(loadKg, false)} × ${reps}`;
  if (e.metric === 'bodyweight_reps') return `× ${reps}`;
  return reps;
}

/** Compact cell text for a logged set, e.g. "82.5 × 8", "× 12", "40 m". */
export function resultText(e: Pick<ProgramExercise, 'metric'>, s: Pick<LoggedSet, 'weightKg' | 'reps' | 'durationS' | 'distanceM'> | undefined): string {
  if (!s) return '—';
  switch (e.metric) {
    case 'weight_reps':
      return `${loadNumber(s.weightKg ?? 0, true)} × ${s.reps ?? 0}`;
    case 'bodyweight_reps':
      return `× ${s.reps ?? 0}`;
    case 'time':
      return `${s.durationS ?? 0} s`;
    case 'distance':
      return `${s.distanceM ?? 0} m`;
  }
}

export function prescriptionLine(e: ProgramExercise, suggestedKg: number | null): string {
  const first = e.sets[0];
  if (!first) return '';
  const n = e.sets.length;
  if (e.metric === 'distance') return `${n} × ${first.distanceM} m`;
  if (e.metric === 'time') return `${n} × ${first.durationS} s`;
  const reps = first.repsMin != null && first.repsMax != null && first.repsMin !== first.repsMax ? `${first.repsMin}–${first.repsMax}` : `${first.repsMax ?? first.repsMin}`;
  const load = e.metric === 'weight_reps' ? ` · ${prescribed(suggestedKg ?? first.loadKg)}` : '';
  return `${n} × ${reps}${load}`;
}

export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
