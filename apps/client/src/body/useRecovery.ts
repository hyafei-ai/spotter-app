import { useEffect, useMemo } from 'react';
import { hrvRead, recoveryHeadline, restingHrRead, sleepRead, wearableSourceWords } from '@spotter/core';
import { localDate } from '../nutrition/store';
import { useHealthImports } from '../health/store';
import { useHealthStatus } from '../health/HealthRow';

/** Sleep, HRV and resting HR against the person's own usual, from the health import (MOCK in the demo). */
export function useRecovery() {
  const days = useHealthImports((s) => s.wearableDays);
  const origin = useHealthImports((s) => s.origin);
  const status = useHealthStatus((s) => s.status);
  const today = localDate();
  useEffect(() => {
    void useHealthImports.getState().refresh();
  }, [status]);
  return useMemo(() => {
    const sleep = sleepRead(days, today);
    const hrv = hrvRead(days, today);
    const rhr = restingHrRead(days, today);
    return {
      sleep,
      hrv,
      rhr,
      headline: recoveryHeadline(sleep, hrv, rhr),
      source: wearableSourceWords(days),
      origin,
      empty: days.length === 0,
    };
  }, [days, today, origin]);
}

export const hours = (h: number | null) => (h == null ? '–' : `${Math.round(h * 10) / 10} h`);
