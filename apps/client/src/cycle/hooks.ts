import { useCallback, useMemo } from 'react';
import { appliedPctFor, calibratedLoad, calibrationLine, estimateCycle, fromDisplay, type Calibration, type CycleEstimate, type CycleProfile } from '@spotter/core';
import { tenant } from '../env';
import { useApp } from '../store';
import { localDate } from '../nutrition/store';
import { calibrate, profileOf, useCycle } from './store';

/** The client's cycle profile, rebuilt only when its parts change (stable for memo deps). */
export function useCycleProfile(): CycleProfile {
  const mode = useCycle((s) => s.mode);
  const birthYear = useCycle((s) => s.birthYear);
  const shareWithCoach = useCycle((s) => s.shareWithCoach);
  const periods = useCycle((s) => s.periods);
  return useMemo(() => profileOf({ mode, birthYear, shareWithCoach, periods }), [mode, birthYear, shareWithCoach, periods]);
}

/** Today's estimate and the calibration from the client's own sessions. */
export function useCycleToday(): { today: string; profile: CycleProfile; estimate: CycleEstimate; calibration: Calibration } {
  const profile = useCycleProfile();
  const completed = useApp((s) => s.completed);
  const today = localDate();
  const estimate = useMemo(() => estimateCycle(profile, today), [profile, today]);
  const calibration = useMemo(() => calibrate(profile, completed, today), [profile, completed, today]);
  return { today, profile, estimate, calibration };
}

export interface SessionCalibration {
  /** Calibration changes suggested loads in this session. */
  active: boolean;
  /** "Loads 3.5% lighter today: …", shown while active or switched off (to switch back). */
  line: string | null;
  /** The client chose "Use planned loads instead" for this session. */
  off: boolean;
  setOff(off: boolean): void;
  /** A suggested (never a logged) load after calibration, on the tenant's plate increment. */
  adjust(kg: number | null): number | null;
}

/**
 * Calibrated suggested loads for the session logger. Never stacked on the coach's lighter or recovery
 * version: if the client picked one from Today's read, the coach's rule already lightens the session, so
 * calibration stays out of it rather than silently compounding the reduction.
 */
export function useSessionCalibration(sessionId: string | null, variant: 'planned' | 'lighter' | 'recovery' | undefined): SessionCalibration {
  const { estimate, calibration } = useCycleToday();
  const plannedLoadsFor = useCycle((s) => s.plannedLoadsFor);
  const choosePlannedLoads = useCycle((s) => s.choosePlannedLoads);
  const pct = appliedPctFor(calibration, estimate.phase);
  const eligible = !!sessionId && pct !== 0 && (!variant || variant === 'planned');
  const off = eligible && plannedLoadsFor === sessionId;
  const active = eligible && !off;
  const inc = fromDisplay(tenant.weightIncrement, tenant.units);
  const adjust = useCallback(
    (kg: number | null) => (kg == null || !active ? kg : calibratedLoad(kg, calibration, estimate.phase, inc)),
    [active, calibration, estimate.phase, inc],
  );
  const setOff = useCallback((o: boolean) => choosePlannedLoads(o ? sessionId : null), [sessionId, choosePlannedLoads]);
  return { active, off, setOff, adjust, line: eligible ? calibrationLine(calibration, estimate.phase) : null };
}
