import { describeExercise, roundToIncrement, toDisplay, type ProgramExerciseDef } from '@spotter/core';
import { tenant } from './env';

export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Loads are stored in kg; lb tenants see them converted and rounded to their plate increment. */
export function describeInUnit(e: ProgramExerciseDef): string {
  if (tenant.units === 'kg') return describeExercise(e, 'kg');
  return describeExercise(
    {
      ...e,
      sets: e.sets.map((s) =>
        s.loadType === 'absolute' && s.loadValue != null ? { ...s, loadValue: roundToIncrement(toDisplay(s.loadValue, 'lb'), tenant.weightIncrement) } : s,
      ),
    },
    'lb',
  );
}
