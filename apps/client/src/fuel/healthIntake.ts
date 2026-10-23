import { useEffect, useState } from 'react';
import type { HealthNutritionDayLike } from '@spotter/core';
import { demoHealthNutritionDays } from '@spotter/core/demo';
import { health } from '../health/source';
import { useHealthStatus } from '../health/HealthRow';
import { IS_DEMO } from '../env';
import { useHealthImports } from '../health/store';

/**
 * Food the phone's health store holds (written there by apps like MyMacros), one total per day, so
 * athletes who log elsewhere never re-enter it.
 *
 * Real builds use the health import (src/health/store.ts, the last 28 days read on connect and refresh).
 * MOCK: the demo returns two weeks of sample days "from MyMacros".
 */
export async function readHealthIntake(): Promise<HealthNutritionDayLike[]> {
  if (IS_DEMO) return demoHealthNutritionDays();
  // Days with no energy total carry nothing the fuel check can use.
  return useHealthImports
    .getState()
    .nutritionDays.filter((d) => d.kcal != null)
    .map((d) => ({ date: d.date, kcal: d.kcal!, proteinG: d.proteinG ?? 0, carbsG: d.carbsG ?? 0, fatG: d.fatG ?? 0, sources: d.sources }));
}

/** "Apple Health" or "Health Connect"; the demo (web, no health store) says Apple Health. */
export const healthProvider = (): string => health.provider ?? 'Apple Health';

// Stable empty: a fresh [] in state on every load would re-render consumers needlessly.
const NONE: HealthNutritionDayLike[] = [];

/** Health-store food days, re-read when the health connection changes. */
export function useHealthIntake(): { days: HealthNutritionDayLike[]; connected: boolean } {
  const status = useHealthStatus((s) => s.status);
  const readAt = useHealthImports((s) => s.readAt);
  const [days, setDays] = useState<HealthNutritionDayLike[]>(NONE);
  useEffect(() => {
    let live = true;
    void readHealthIntake().then((d) => live && setDays(d.length ? d : NONE));
    return () => {
      live = false;
    };
  }, [status, readAt]);
  return { days, connected: IS_DEMO || status === 'connected' };
}
