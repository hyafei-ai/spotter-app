import type { CalibrationInput, CycleEstimate, FuelPattern, PhaseAdjustment, Symptom } from '@spotter/core';

/*
 * Adapters for the brief's inputs that other builds own. Each returns null for now, so the brief
 * degrades gracefully (no cycle context, no fuel pattern, no symptoms) until the integrator wires them.
 * Keep the signatures: useBrief, the Progress screen and the shared read depend on them.
 */

/** Today's cycle estimate. */
export function useCycleEstimate(): CycleEstimate | null {
  // TODO-INTEGRATE: read today's estimate from apps/client/src/cycle/store.ts (cycle.ts estimate for localDate()).
  return null;
}

/** The calibration for today's phase (only when the calibrator has one for it). */
export function useCalibrationToday(): PhaseAdjustment | null {
  // TODO-INTEGRATE: from apps/client/src/cycle/store.ts, the Calibration's adjustment whose phase matches today's estimate.
  return null;
}

/** The cycle estimate for any past date, for phase-calibrated bests on the Progress screen. */
export function usePhaseOn(): CalibrationInput['phaseOn'] | null {
  // TODO-INTEGRATE: apps/client/src/cycle/store.ts phaseOn(date), built from the same period logs.
  return null;
}

/** Whether the athlete shares their cycle with the coach (CycleProfile.shareWithCoach). */
export function useCycleShared(): boolean {
  // TODO-INTEGRATE: apps/client/src/cycle/store.ts profile.shareWithCoach. Until then the daily check's
  // per-day "Share cycle phase" toggle decides (see useBrief).
  return false;
}

/** Today's symptoms, 0 none … 3 severe. */
export function useSymptomsToday(): Partial<Record<Symptom, number>> | null {
  // TODO-INTEGRATE: today's symptom log from apps/client/src/cycle/store.ts.
  return null;
}

/** The fuelling pattern from fuel.ts. */
export function useFuelPattern(): FuelPattern | null {
  // TODO-INTEGRATE: apps/client/src/fuel/store.ts (fuel pattern for localDate()).
  return null;
}

/** Whether the athlete shares fuelling with the coach. Not shared by default. */
export function useFuelShared(): boolean {
  // TODO-INTEGRATE: apps/client/src/fuel/store.ts sharing flag.
  return false;
}
