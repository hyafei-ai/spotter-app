import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  IMPORTED_ACTIVITIES,
  type HealthNutritionDay,
  type HealthPeriod,
  type ImportedActivity,
  type ImportedWorkout,
  type WearableDay,
} from '@spotter/core';
import { demoImportedWorkouts, demoNutritionDays, demoWearableDays } from '@spotter/core/demo';
import { kv } from '../storage';
import { syncQueue } from '../sync';
import { IS_DEMO, tenant } from '../env';
import { health } from './source';
import { useHealthStatus } from './HealthRow';

/**
 * What Spotter has read from Apple Health / Health Connect, so the athlete never types it twice:
 * wearable days (sleep, HRV, resting HR, active energy), food totals other apps wrote, workouts recorded
 * elsewhere and (only after cycle tracking is on) periods. Read-only on the health side. Wearable days
 * and workouts sync to the athlete's own rows; nutrition and periods stay on the phone for the fuel and
 * cycle builds to pick up.
 *
 * MOCK: demo builds with no health app connected use invented sample data (packages/core/src/demo/wearables.ts).
 */

export const HEALTH_DAYS = 28;

/** Stable empties for selectors (a fresh [] each render loops React: #185). */
export const NO_WEARABLE_DAYS: WearableDay[] = [];
export const NO_WORKOUTS: ImportedWorkout[] = [];
export const NO_NUTRITION_DAYS: HealthNutritionDay[] = [];
export const NO_PERIODS: HealthPeriod[] = [];

export type DataOrigin = 'health' | 'mock' | 'none';

interface HealthImportState {
  wearableDays: WearableDay[];
  nutritionDays: HealthNutritionDay[];
  workouts: ImportedWorkout[];
  periods: HealthPeriod[];
  /** Activity types the athlete turned off in Me → Health app. */
  hiddenActivities: ImportedActivity[];
  /** Who sees what: whether the coach sees imported workouts (type, date, duration, distance; never heart rate). */
  shareImported: boolean;
  setShareImported(on: boolean): Promise<void>;
  /** Cycle data is only read after this is granted, from turning cycle tracking on. */
  cycleAccess: 'granted' | 'denied' | null;
  origin: DataOrigin;
  readAt: string | null;
  refresh(): Promise<void>;
  setActivityOn(a: ImportedActivity, on: boolean): void;
  requestCycleAccess(): Promise<void>;
  clear(): void;
}

const mock = () => ({
  wearableDays: demoWearableDays(),
  nutritionDays: demoNutritionDays(),
  workouts: demoImportedWorkouts(),
  periods: NO_PERIODS,
  origin: 'mock' as const,
});

let refreshing: Promise<void> | null = null;

export const useHealthImports = create<HealthImportState>()(
  persist(
    (set, get) => ({
      ...(IS_DEMO ? mock() : { wearableDays: NO_WEARABLE_DAYS, nutritionDays: NO_NUTRITION_DAYS, workouts: NO_WORKOUTS, periods: NO_PERIODS, origin: 'none' as const }),
      hiddenActivities: [],
      shareImported: true,
      cycleAccess: null,
      readAt: null,

      refresh() {
        if (refreshing) return refreshing;
        refreshing = (async () => {
          const connected = useHealthStatus.getState().status === 'connected';
          if (!connected) {
            set(IS_DEMO ? { ...mock(), readAt: new Date().toISOString() } : { wearableDays: NO_WEARABLE_DAYS, nutritionDays: NO_NUTRITION_DAYS, workouts: NO_WORKOUTS, origin: 'none' });
            return;
          }
          const [wearableDays, nutritionDays, workouts, periods] = await Promise.all([
            health.readDays(HEALTH_DAYS).catch(() => NO_WEARABLE_DAYS),
            health.readNutritionDays(HEALTH_DAYS).catch(() => NO_NUTRITION_DAYS),
            health.readWorkouts(HEALTH_DAYS).catch(() => NO_WORKOUTS),
            get().cycleAccess === 'granted' ? health.readPeriods().catch(() => NO_PERIODS) : Promise.resolve(NO_PERIODS),
          ]);
          set({ wearableDays, nutritionDays, workouts, periods, origin: 'health', readAt: new Date().toISOString() });
          // The athlete's own rows only; the coach never reads raw wearable data.
          const days = wearableDays.filter((d) => d.hrvMs != null || d.restingHr != null || d.sleepHours != null || d.activeKcal != null);
          if (days.length) await syncQueue.enqueue('wearable.days', { days: days.slice(-60) });
          const share = get().shareImported;
          const hidden = new Set(get().hiddenActivities);
          const shown = workouts.filter((w) => !hidden.has(w.activity));
          if (shown.length) {
            await syncQueue.enqueue('workout.import', {
              workouts: shown.slice(-100).map((w) => ({
                externalId: w.id,
                date: w.date,
                startedAt: w.startedAt,
                durationMin: w.durationMin,
                activity: w.activity,
                activeKcal: w.activeKcal,
                distanceM: w.distanceM,
                avgHr: w.avgHr,
                maxHr: w.maxHr,
                source: w.source,
                sourceApp: w.sourceApp,
                shareWithCoach: share,
              })),
            });
          }
          void syncQueue.flush();
        })().finally(() => {
          refreshing = null;
        });
        return refreshing;
      },

      async setShareImported(on) {
        set({ shareImported: on });
        // Re-sending the imports updates share_with_coach on the rows already synced.
        if (useHealthStatus.getState().status === 'connected') await get().refresh();
      },

      setActivityOn(a, on) {
        const hidden = new Set(get().hiddenActivities);
        if (on) hidden.delete(a);
        else hidden.add(a);
        set({ hiddenActivities: IMPORTED_ACTIVITIES.filter((x) => hidden.has(x)) });
      },

      async requestCycleAccess() {
        if (useHealthStatus.getState().status !== 'connected') return;
        const r = await health.connectCycle();
        set({ cycleAccess: r === 'granted' ? 'granted' : r === 'denied' ? 'denied' : null });
        if (r === 'granted') set({ periods: await health.readPeriods().catch(() => NO_PERIODS) });
      },

      clear: () => set({ wearableDays: NO_WEARABLE_DAYS, nutritionDays: NO_NUTRITION_DAYS, workouts: NO_WORKOUTS, periods: NO_PERIODS, origin: 'none', readAt: null }),
    }),
    {
      name: `spotter.healthImports.${tenant.slug}`,
      storage: createJSONStorage(() => kv),
      partialize: ({ wearableDays, nutritionDays, workouts, periods, hiddenActivities, shareImported, cycleAccess, origin, readAt }) => ({
        shareImported,
        wearableDays,
        nutritionDays,
        workouts,
        periods,
        hiddenActivities,
        cycleAccess,
        origin,
        readAt,
      }),
    },
  ),
);

/** Imported workouts the athlete hasn't turned off. */
export function visibleWorkouts(workouts: ImportedWorkout[], hidden: ImportedActivity[]): ImportedWorkout[] {
  if (!hidden.length) return workouts;
  const h = new Set(hidden);
  return workouts.filter((w) => !h.has(w.activity));
}
