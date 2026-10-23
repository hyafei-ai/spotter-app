import {
  ExerciseType,
  MenstruationFlow,
  SdkAvailabilityStatus,
  aggregateRecord,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
  type ReadRecordsResult,
  type RecordType,
} from 'react-native-health-connect';
import { groupFlowDays, type ImportedActivity, type ImportedWorkout } from '@spotter/core';
import { localDay, sleepDayOf, sleepWindow, startOfDay, toNutritionDays, toWearableDays, windowStart, type HealthSource } from './types';

/*
 * Health Connect (read only).
 * NOT VERIFIED ON DEVICE: written against the installed react-native-health-connect 4.1 types only.
 */

const PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'SleepSession' },
  // Daily brief: own-baseline HRV (RMSSD) and resting heart rate, active energy, workouts.
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'ExerciseSession' },
  // Food totals other apps write, so they're never typed twice.
  { accessType: 'read', recordType: 'Nutrition' },
] as const;
/** Asked for separately, only when the athlete turns on cycle tracking. */
const CYCLE_PERMISSIONS = [
  { accessType: 'read', recordType: 'MenstruationFlow' },
  { accessType: 'read', recordType: 'MenstruationPeriod' },
] as const;

// Sleep stage types that count as asleep (Health Connect SleepStageType: 1 sleeping, 4 light, 5 deep, 6 REM).
const ASLEEP_STAGES = new Set([1, 4, 5, 6]);

const ACTIVITY: Record<number, ImportedActivity> = {
  [ExerciseType.RUNNING]: 'run',
  [ExerciseType.RUNNING_TREADMILL]: 'run',
  [ExerciseType.WALKING]: 'walk',
  [ExerciseType.HIKING]: 'hike',
  [ExerciseType.BIKING]: 'ride',
  [ExerciseType.BIKING_STATIONARY]: 'ride',
  [ExerciseType.SWIMMING_POOL]: 'swim',
  [ExerciseType.SWIMMING_OPEN_WATER]: 'swim',
  [ExerciseType.ROWING]: 'row',
  [ExerciseType.ROWING_MACHINE]: 'row',
  [ExerciseType.STRENGTH_TRAINING]: 'strength',
  [ExerciseType.WEIGHTLIFTING]: 'strength',
  [ExerciseType.HIGH_INTENSITY_INTERVAL_TRAINING]: 'hiit',
  [ExerciseType.YOGA]: 'yoga',
  [ExerciseType.PILATES]: 'pilates',
  [ExerciseType.STRETCHING]: 'flexibility',
  [ExerciseType.DANCING]: 'dance',
  [ExerciseType.EXERCISE_CLASS]: 'class',
  [ExerciseType.BOOT_CAMP]: 'class',
};

/** Friendly names for common data origins (Android package names). Anything else shows the package name. */
const APP_NAMES: Record<string, string> = {
  'com.myfitnesspal.android': 'MyFitnessPal',
  'com.strava': 'Strava',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.cronometer.android': 'Cronometer',
};
const appName = (origin: string | undefined) => (origin ? (APP_NAMES[origin] ?? origin) : null);

async function ready(): Promise<boolean> {
  try {
    if ((await getSdkStatus()) !== SdkAvailabilityStatus.SDK_AVAILABLE) return false;
    return await initialize();
  } catch {
    return false;
  }
}

/** Every record of a type in the last `days` days, following page tokens (capped at 20 pages). */
async function readAll<T extends RecordType>(recordType: T, days: number): Promise<ReadRecordsResult<T>['records']> {
  const timeRangeFilter = { operator: 'between' as const, startTime: windowStart(days).toISOString(), endTime: new Date().toISOString() };
  const out: ReadRecordsResult<T>['records'] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await readRecords(recordType, { timeRangeFilter, pageSize: 1000, pageToken }).catch(() => null);
    if (!res) break;
    out.push(...res.records);
    pageToken = res.pageToken;
    if (!pageToken) break;
  }
  return out;
}

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);

export const health: HealthSource = {
  provider: 'Health Connect',
  isAvailable: ready,
  async connect() {
    if (!(await ready())) return 'unavailable';
    try {
      const granted = await requestPermission([...PERMISSIONS]);
      return granted.length > 0 ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  },
  async readToday() {
    await ready();
    const now = new Date();
    const win = sleepWindow(now);
    const [steps, weights, sleeps] = await Promise.all([
      aggregateRecord({ recordType: 'Steps', timeRangeFilter: { operator: 'between', startTime: startOfDay(now).toISOString(), endTime: now.toISOString() } }).catch(() => null),
      readRecords('Weight', {
        timeRangeFilter: { operator: 'between', startTime: new Date(now.getTime() - 30 * 86_400_000).toISOString(), endTime: now.toISOString() },
        ascendingOrder: false,
        pageSize: 1,
      }).catch(() => null),
      readRecords('SleepSession', { timeRangeFilter: { operator: 'between', startTime: win.start.toISOString(), endTime: win.end.toISOString() } }).catch(() => null),
    ]);
    const w = weights?.records[0];
    let asleepMs = 0;
    for (const s of sleeps?.records ?? []) {
      const stages = s.stages ?? [];
      if (stages.length) {
        for (const st of stages) if (ASLEEP_STAGES.has(st.stage)) asleepMs += Date.parse(st.endTime) - Date.parse(st.startTime);
      } else {
        asleepMs += Date.parse(s.endTime) - Date.parse(s.startTime);
      }
    }
    return {
      steps: steps ? Math.round(steps.COUNT_TOTAL) : null,
      bodyweightKg: w ? Math.round(w.weight.inKilograms * 10) / 10 : null,
      bodyweightAt: w ? w.time : null,
      sleepHours: asleepMs > 0 ? Math.round((asleepMs / 3_600_000) * 10) / 10 : null,
    };
  },
  async readDays(days) {
    await ready();
    const [hrv, rhr, active, sleeps] = await Promise.all([
      readAll('HeartRateVariabilityRmssd', days),
      readAll('RestingHeartRate', days),
      readAll('ActiveCaloriesBurned', days),
      readAll('SleepSession', days),
    ]);
    const sleepMs: { day: string; ms: number }[] = [];
    for (const s of sleeps) {
      const stages = s.stages ?? [];
      const ms = stages.length
        ? stages.filter((st) => ASLEEP_STAGES.has(st.stage)).reduce((a, st) => a + Date.parse(st.endTime) - Date.parse(st.startTime), 0)
        : Date.parse(s.endTime) - Date.parse(s.startTime);
      sleepMs.push({ day: sleepDayOf(new Date(s.endTime)), ms });
    }
    return toWearableDays(
      'health_connect',
      hrv.map((r) => ({ day: localDay(new Date(r.time)), v: r.heartRateVariabilityMillis })),
      rhr.map((r) => ({ day: localDay(new Date(r.time)), v: r.beatsPerMinute })),
      active.map((r) => ({ day: localDay(new Date(r.startTime)), v: r.energy.inKilocalories })),
      sleepMs,
    );
  },
  async readNutritionDays(days) {
    await ready();
    const records = await readAll('Nutrition', days);
    return toNutritionDays(
      records.map((r) => ({
        day: localDay(new Date(r.startTime)),
        kcal: r.energy?.inKilocalories ?? null,
        proteinG: r.protein?.inGrams ?? null,
        carbsG: r.totalCarbohydrate?.inGrams ?? null,
        fatG: r.totalFat?.inGrams ?? null,
        source: appName(r.metadata?.dataOrigin),
      })),
    );
  },
  async readWorkouts(days) {
    await ready();
    const [sessions, heart, distance, active] = await Promise.all([
      readAll('ExerciseSession', days),
      readAll('HeartRate', days),
      readAll('Distance', days),
      readAll('ActiveCaloriesBurned', days),
    ]);
    return sessions.map((s): ImportedWorkout => {
      const bpm = heart
        .filter((h) => overlaps(h.startTime, h.endTime, s.startTime, s.endTime))
        .flatMap((h) => h.samples.filter((x) => x.time >= s.startTime && x.time <= s.endTime).map((x) => x.beatsPerMinute));
      const m = distance.filter((d) => overlaps(d.startTime, d.endTime, s.startTime, s.endTime)).reduce((a, d) => a + d.distance.inMeters, 0);
      const kcal = active.filter((a) => overlaps(a.startTime, a.endTime, s.startTime, s.endTime)).reduce((a, x) => a + x.energy.inKilocalories, 0);
      const start = new Date(s.startTime);
      return {
        id: s.metadata?.id ?? `${s.startTime}-${s.exerciseType}`,
        date: localDay(start),
        startedAt: start.toISOString(),
        durationMin: Math.round((Date.parse(s.endTime) - Date.parse(s.startTime)) / 6_000) / 10,
        activity: ACTIVITY[s.exerciseType] ?? 'other',
        activeKcal: kcal > 0 ? Math.round(kcal) : null,
        distanceM: m > 0 ? Math.round(m) : null,
        avgHr: bpm.length ? Math.round(bpm.reduce((a, b) => a + b, 0) / bpm.length) : null,
        maxHr: bpm.length ? Math.max(...bpm) : null,
        source: 'health_connect',
        sourceApp: appName(s.metadata?.dataOrigin),
      };
    });
  },
  async connectCycle() {
    if (!(await ready())) return 'unavailable';
    try {
      const granted = await requestPermission([...CYCLE_PERMISSIONS]);
      return granted.length > 0 ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  },
  async readPeriods() {
    await ready();
    const [flow, periods] = await Promise.all([readAll('MenstruationFlow', 365), readAll('MenstruationPeriod', 365)]);
    // Flow days with a known amount (UNKNOWN is treated like Apple Health's "unspecified" and skipped).
    const days = flow.filter((f) => f.flow != null && f.flow !== MenstruationFlow.UNKNOWN).map((f) => localDay(new Date(f.time)));
    // Period records may come as a single time or a start/end interval, depending on the app that wrote them.
    for (const p of periods as { time?: string; startTime?: string; endTime?: string }[]) {
      const from = p.startTime ?? p.time;
      if (!from) continue;
      const to = p.endTime ?? from;
      for (let d = new Date(from); d <= new Date(to); d.setDate(d.getDate() + 1)) days.push(localDay(d));
    }
    return groupFlowDays(days);
  },
  openSettings: () => openHealthConnectSettings(),
};
