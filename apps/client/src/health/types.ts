import type { HealthNutritionDay, HealthPeriod, ImportedWorkout, WearableDay } from '@spotter/core';

/**
 * Read-only health data (C-10 "connected health app"): steps, bodyweight, sleep, and for the daily brief
 * HRV, resting heart rate, active energy, food totals other apps wrote, workouts and (only once cycle
 * tracking is on) menstrual flow. Apple Watch data arrives through Apple Health.
 */

export type HealthProvider = 'Apple Health' | 'Health Connect';

export interface HealthToday {
  steps: number | null;
  /** Most recent bodyweight in kg, with when it was measured. */
  bodyweightKg: number | null;
  bodyweightAt: string | null;
  /** Hours asleep in the last night (ending today). */
  sleepHours: number | null;
}

export type ConnectResult = 'granted' | 'denied' | 'unavailable';

export interface HealthSource {
  provider: HealthProvider | null;
  /** False on web, on iPad without Health, or Android without Health Connect installed. */
  isAvailable(): Promise<boolean>;
  connect(): Promise<ConnectResult>;
  readToday(): Promise<HealthToday>;
  /** Sleep, HRV, resting heart rate and active energy per local day for the last `days` days, oldest first. */
  readDays(days: number): Promise<WearableDay[]>;
  /** Daily food totals other apps (MyMacros, MyFitnessPal…) wrote to the health app, with their names. */
  readNutritionDays(days: number): Promise<HealthNutritionDay[]>;
  /** Workouts recorded outside Spotter (Apple Watch Workout app, Strava…) in the last `days` days. */
  readWorkouts(days: number): Promise<ImportedWorkout[]>;
  /**
   * Asks for menstrual-flow access. Called only when the athlete turns on cycle tracking, never at the
   * first connect: cycle data is sensitive.
   */
  connectCycle(): Promise<ConnectResult>;
  /** Periods over the last 365 days from menstrual-flow records (consecutive flow days grouped). */
  readPeriods(): Promise<HealthPeriod[]>;
  /** Where the user turns access off again (the OS owns the permission). */
  openSettings(): void;
}

/** Last night's window: 6 pm yesterday to noon today, local time. */
export function sleepWindow(now = new Date()): { start: Date; end: Date } {
  const end = new Date(now);
  end.setHours(12, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 1);
  start.setHours(18, 0, 0, 0);
  return { start, end };
}

export function startOfDay(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** YYYY-MM-DD in the phone's time zone. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Start of the window covering today and the `days − 1` days before it. */
export function windowStart(days: number, now = new Date()): Date {
  const d = startOfDay(now);
  d.setDate(d.getDate() - (days - 1));
  return d;
}

/** The night a sleep segment belongs to: anything ending before 6 pm counts for that morning's date. */
export function sleepDayOf(end: Date): string {
  const d = new Date(end);
  if (d.getHours() >= 18) d.setDate(d.getDate() + 1);
  return localDay(d);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

/** Builds one WearableDay per date that has any reading, oldest first. */
export function toWearableDays(
  source: WearableDay['source'],
  hrv: { day: string; v: number }[],
  rhr: { day: string; v: number }[],
  active: { day: string; v: number }[],
  sleepMs: { day: string; ms: number }[],
): WearableDay[] {
  const days = [...new Set([...hrv, ...rhr, ...active, ...sleepMs].map((x) => x.day))].sort();
  return days.map((date) => {
    const sleep = sleepMs.filter((x) => x.day === date).reduce((a, x) => a + x.ms, 0);
    const kcal = active.filter((x) => x.day === date).reduce((a, x) => a + x.v, 0);
    return {
      date,
      sleepHours: sleep > 0 ? r1(sleep / 3_600_000) : null,
      hrvMs: r1(mean(hrv.filter((x) => x.day === date).map((x) => x.v))),
      restingHr: r1(mean(rhr.filter((x) => x.day === date).map((x) => x.v))),
      activeKcal: kcal > 0 ? Math.round(kcal) : null,
      source,
    };
  });
}

/** Sums per-sample food values into daily totals, keeping which apps wrote them. */
export function toNutritionDays(
  rows: { day: string; kcal?: number | null; proteinG?: number | null; carbsG?: number | null; fatG?: number | null; source: string | null }[],
): HealthNutritionDay[] {
  const out = new Map<string, HealthNutritionDay>();
  const add = (a: number | null, b: number | null | undefined) => (b == null ? a : (a ?? 0) + b);
  for (const r of rows) {
    const d = out.get(r.day) ?? { date: r.day, kcal: null, proteinG: null, carbsG: null, fatG: null, sources: [] };
    d.kcal = add(d.kcal, r.kcal);
    d.proteinG = add(d.proteinG, r.proteinG);
    d.carbsG = add(d.carbsG, r.carbsG);
    d.fatG = add(d.fatG, r.fatG);
    if (r.source && !d.sources.includes(r.source)) d.sources.push(r.source);
    out.set(r.day, d);
  }
  return [...out.values()]
    .map((d) => ({ ...d, kcal: d.kcal == null ? null : Math.round(d.kcal), proteinG: r1(d.proteinG), carbsG: r1(d.carbsG), fatG: r1(d.fatG) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
