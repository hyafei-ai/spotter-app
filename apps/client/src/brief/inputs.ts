import { useCallback, useMemo } from 'react';
import { estimateCycle, type CalibrationInput, type CycleEstimate, type FuelPattern, type PhaseAdjustment, type Symptom } from '@spotter/core';
import { useCycleProfile, useCycleToday } from '../cycle/hooks';
import { useCycle } from '../cycle/store';
import { useFuelCheck } from '../fuel/useFuelCheck';
import { useFuel } from '../fuel/store';
import { localDate } from '../nutrition/store';

/*
 * The brief's inputs from the cycle and fuel builds. Keep the signatures: useBrief, the Progress screen
 * and the shared read depend on them.
 */

/** Today's cycle estimate; null when the athlete doesn't track. */
export function useCycleEstimate(): CycleEstimate | null {
  const { estimate } = useCycleToday();
  return estimate.mode === 'not_tracking' ? null : estimate;
}

/** The calibration for today's phase (only when the calibrator has one for it). */
export function useCalibrationToday(): PhaseAdjustment | null {
  const { estimate, calibration } = useCycleToday();
  return useMemo(
    () => (estimate.phase ? (calibration.adjustments.find((a) => a.phase === estimate.phase) ?? null) : null),
    [estimate.phase, calibration],
  );
}

/** The cycle estimate for any past date, for phase-calibrated bests on the Progress screen. */
export function usePhaseOn(): CalibrationInput['phaseOn'] | null {
  const profile = useCycleProfile();
  const phaseOn = useCallback((date: string) => estimateCycle(profile, date), [profile]);
  return profile.mode === 'not_tracking' ? null : phaseOn;
}

/** Whether the athlete shares their cycle with the coach (Your cycle). */
export function useCycleShared(): boolean {
  return useCycle((s) => s.shareWithCoach);
}

/** Today's symptoms, 0 none … 3 severe. */
export function useSymptomsToday(): Partial<Record<Symptom, number>> | null {
  const today = localDate();
  return useCycle((s) => s.symptoms.find((x) => x.date === today)?.scores ?? null);
}

/** The fuelling pattern from fuel.ts. */
export function useFuelPattern(): FuelPattern | null {
  const { check } = useFuelCheck();
  return check.eaBand === 'unknown' && check.level === 'none' ? null : check;
}

/** Whether the athlete shares the fuel check with the coach. Not shared by default. */
export function useFuelShared(): boolean {
  return useFuel((s) => s.settings.shareWithCoach);
}
