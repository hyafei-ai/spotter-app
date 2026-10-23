import { useEffect, useState } from 'react';
import type { HealthNutritionDayLike } from '@spotter/core';
import { demoHealthNutritionDays } from '@spotter/core/demo';
import { health } from '../health/source';
import { useHealthStatus } from '../health/HealthRow';
import { IS_DEMO } from '../env';

/**
 * Food the phone's health store holds (written there by apps like MyMacros), one total per day, so
 * athletes who log elsewhere never re-enter it.
 *
 * TODO-INTEGRATE: wire to the health source's nutrition read (physiology.ts HealthNutritionDay, from
 * the brief/wearables build). Until then real builds get [] and the fuel check uses Spotter's own log.
 * MOCK: the demo returns two weeks of sample days "from MyMacros".
 */
export async function readHealthIntake(): Promise<HealthNutritionDayLike[]> {
  if (IS_DEMO) return demoHealthNutritionDays();
  return [];
}

/** "Apple Health" or "Health Connect"; the demo (web, no health store) says Apple Health. */
export const healthProvider = (): string => health.provider ?? 'Apple Health';

// Stable empty: a fresh [] in state on every load would re-render consumers needlessly.
const NONE: HealthNutritionDayLike[] = [];

/** Health-store food days, re-read when the health connection changes. */
export function useHealthIntake(): { days: HealthNutritionDayLike[]; connected: boolean } {
  const status = useHealthStatus((s) => s.status);
  const [days, setDays] = useState<HealthNutritionDayLike[]>(NONE);
  useEffect(() => {
    let live = true;
    void readHealthIntake().then((d) => live && setDays(d.length ? d : NONE));
    return () => {
      live = false;
    };
  }, [status]);
  return { days, connected: IS_DEMO || status === 'connected' };
}
