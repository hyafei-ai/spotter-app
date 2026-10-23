import { Linking } from 'react-native';
import {
  CategoryValueMenstrualFlow,
  CategoryValueSleepAnalysis,
  WorkoutActivityType,
  getMostRecentQuantitySample,
  isHealthDataAvailableAsync,
  queryCategorySamples,
  queryQuantitySamples,
  queryStatisticsForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
  type QuantityTypeIdentifier,
} from '@kingstinct/react-native-healthkit';
import { groupFlowDays, type ImportedActivity, type ImportedWorkout } from '@spotter/core';
import { localDay, sleepDayOf, sleepWindow, startOfDay, toNutritionDays, toWearableDays, windowStart, type HealthSource } from './types';

/*
 * Apple Health (read only). Apple Watch data (HRV, resting heart rate, workouts, sleep) arrives here
 * through Apple Health, so there's no separate Apple Watch connection.
 * NOT VERIFIED ON DEVICE: written against the installed @kingstinct/react-native-healthkit 16.2 types only.
 */

const READ = [
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierBodyMass',
  'HKCategoryTypeIdentifierSleepAnalysis',
  // Daily brief: own-baseline HRV (SDNN) and resting heart rate, active energy, workouts.
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierHeartRate',
  'HKWorkoutTypeIdentifier',
  // Food totals other apps write (MyMacros, MyFitnessPal…), so they're never typed twice.
  'HKQuantityTypeIdentifierDietaryEnergyConsumed',
  'HKQuantityTypeIdentifierDietaryProtein',
  'HKQuantityTypeIdentifierDietaryCarbohydrates',
  'HKQuantityTypeIdentifierDietaryFatTotal',
] as const;
/** Asked for separately, only when the athlete turns on cycle tracking. */
const CYCLE_READ = ['HKCategoryTypeIdentifierMenstrualFlow'] as const;

const ASLEEP = new Set<number>([
  CategoryValueSleepAnalysis.asleepUnspecified,
  CategoryValueSleepAnalysis.asleepCore,
  CategoryValueSleepAnalysis.asleepDeep,
  CategoryValueSleepAnalysis.asleepREM,
]);

const ACTIVITY: Partial<Record<WorkoutActivityType, ImportedActivity>> = {
  [WorkoutActivityType.running]: 'run',
  [WorkoutActivityType.walking]: 'walk',
  [WorkoutActivityType.hiking]: 'hike',
  [WorkoutActivityType.cycling]: 'ride',
  [WorkoutActivityType.swimming]: 'swim',
  [WorkoutActivityType.rowing]: 'row',
  [WorkoutActivityType.traditionalStrengthTraining]: 'strength',
  [WorkoutActivityType.functionalStrengthTraining]: 'strength',
  [WorkoutActivityType.highIntensityIntervalTraining]: 'hiit',
  [WorkoutActivityType.yoga]: 'yoga',
  [WorkoutActivityType.pilates]: 'pilates',
  [WorkoutActivityType.flexibility]: 'flexibility',
  [WorkoutActivityType.mindAndBody]: 'mind_and_body',
  [WorkoutActivityType.dance]: 'dance',
  [WorkoutActivityType.cardioDance]: 'dance',
  [WorkoutActivityType.socialDance]: 'dance',
  [WorkoutActivityType.crossTraining]: 'class',
  [WorkoutActivityType.mixedCardio]: 'class',
};

const range = (days: number) => ({ date: { startDate: windowStart(days), endDate: new Date() } });

async function samples(id: QuantityTypeIdentifier, unit: string, days: number) {
  // The unit is passed as a plain string; the typed overloads only list each identifier's default unit.
  return queryQuantitySamples(id, { limit: 0, unit: unit as never, filter: range(days) }).catch(() => []);
}

/** Seconds from a HealthKit duration quantity, whatever unit it came in. */
function seconds(q: { quantity: number; unit: string } | undefined): number {
  if (!q) return 0;
  return q.unit === 'min' ? q.quantity * 60 : q.unit === 'hr' ? q.quantity * 3600 : q.quantity;
}

function meters(q: { quantity: number; unit: string } | undefined): number | null {
  if (!q) return null;
  const f: Record<string, number> = { m: 1, km: 1000, mi: 1609.344, ft: 0.3048, yd: 0.9144 };
  return Math.round(q.quantity * (f[q.unit] ?? 1));
}

export const health: HealthSource = {
  provider: 'Apple Health',
  isAvailable: () => isHealthDataAvailableAsync(),
  async connect() {
    if (!(await isHealthDataAvailableAsync())) return 'unavailable';
    try {
      return (await requestAuthorization({ toRead: READ })) ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  },
  async readToday() {
    const now = new Date();
    const [steps, weight, sleep] = await Promise.all([
      queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], {
        filter: { date: { startDate: startOfDay(now), endDate: now } },
        unit: 'count',
      }).catch(() => null),
      getMostRecentQuantitySample('HKQuantityTypeIdentifierBodyMass', 'kg').catch(() => undefined),
      queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
        limit: 0,
        filter: { date: { startDate: sleepWindow(now).start, endDate: sleepWindow(now).end } },
      }).catch(() => []),
    ]);
    const asleepMs = sleep
      .filter((s) => ASLEEP.has(Number(s.value)))
      .reduce((ms, s) => ms + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()), 0);
    return {
      steps: steps?.sumQuantity ? Math.round(steps.sumQuantity.quantity) : null,
      bodyweightKg: weight ? Math.round(weight.quantity * 10) / 10 : null,
      bodyweightAt: weight ? new Date(weight.endDate).toISOString() : null,
      sleepHours: asleepMs > 0 ? Math.round((asleepMs / 3_600_000) * 10) / 10 : null,
    };
  },
  async readDays(days) {
    const [hrv, rhr, active, sleep] = await Promise.all([
      samples('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms', days),
      samples('HKQuantityTypeIdentifierRestingHeartRate', 'count/min', days),
      samples('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', days),
      queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { limit: 0, filter: range(days) }).catch(() => []),
    ]);
    const v = (xs: readonly { startDate: Date; quantity: number }[]) => xs.map((x) => ({ day: localDay(new Date(x.startDate)), v: x.quantity }));
    return toWearableDays(
      'apple_health',
      v(hrv),
      v(rhr),
      v(active),
      sleep
        .filter((s) => ASLEEP.has(Number(s.value)))
        .map((s) => ({ day: sleepDayOf(new Date(s.endDate)), ms: new Date(s.endDate).getTime() - new Date(s.startDate).getTime() })),
    );
  },
  async readNutritionDays(days) {
    const [kcal, protein, carbs, fat] = await Promise.all([
      samples('HKQuantityTypeIdentifierDietaryEnergyConsumed', 'kcal', days),
      samples('HKQuantityTypeIdentifierDietaryProtein', 'g', days),
      samples('HKQuantityTypeIdentifierDietaryCarbohydrates', 'g', days),
      samples('HKQuantityTypeIdentifierDietaryFatTotal', 'g', days),
    ]);
    const rows = (xs: readonly { startDate: Date; quantity: number; sourceRevision: { source: { name: string } } }[], key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') =>
      xs.map((x) => ({ day: localDay(new Date(x.startDate)), [key]: x.quantity, source: x.sourceRevision?.source?.name ?? null }));
    return toNutritionDays([...rows(kcal, 'kcal'), ...rows(protein, 'proteinG'), ...rows(carbs, 'carbsG'), ...rows(fat, 'fatG')]);
  },
  async readWorkouts(days) {
    const workouts = await queryWorkoutSamples({ limit: 0, filter: range(days) }).catch(() => []);
    const out: ImportedWorkout[] = [];
    for (const w of workouts) {
      const start = new Date(w.startDate);
      const hr = await w.getStatistic('HKQuantityTypeIdentifierHeartRate', 'count/min').catch(() => undefined);
      const src = w.sourceRevision?.source;
      const fromWatch = !!src?.bundleIdentifier?.startsWith('com.apple') && !!w.sourceRevision?.productType?.startsWith('Watch');
      out.push({
        id: w.uuid,
        date: localDay(start),
        startedAt: start.toISOString(),
        durationMin: Math.round(seconds(w.duration) / 6) / 10,
        activity: ACTIVITY[w.workoutActivityType] ?? 'other',
        activeKcal: w.totalEnergyBurned ? Math.round(w.totalEnergyBurned.quantity) : null,
        distanceM: meters(w.totalDistance),
        avgHr: hr?.averageQuantity ? Math.round(hr.averageQuantity.quantity) : null,
        maxHr: hr?.maximumQuantity ? Math.round(hr.maximumQuantity.quantity) : null,
        source: 'apple_health',
        sourceApp: fromWatch ? 'Apple Watch' : (src?.name ?? null),
      });
    }
    return out;
  },
  async connectCycle() {
    if (!(await isHealthDataAvailableAsync())) return 'unavailable';
    try {
      return (await requestAuthorization({ toRead: CYCLE_READ })) ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  },
  async readPeriods() {
    const flow = await queryCategorySamples('HKCategoryTypeIdentifierMenstrualFlow', { limit: 0, filter: range(365) }).catch(() => []);
    const skip = new Set<number>([CategoryValueMenstrualFlow.unspecified, CategoryValueMenstrualFlow.none]);
    return groupFlowDays(flow.filter((s) => !skip.has(Number(s.value))).map((s) => localDay(new Date(s.startDate))));
  },
  openSettings: () => void Linking.openURL('x-apple-health://').catch(() => Linking.openSettings()),
};
