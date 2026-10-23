/*
 * MOCK DATA: health-app readings for the demo client (Jordan Ellis), used in demo builds when no health
 * app is connected. Invented numbers, labelled as such, never shown as anyone's real data.
 * - 28 days of wearable days: HRV (Apple Health SDNN) around 48 ms and resting HR around 58 bpm, with
 *   the last 2 days about 15% under on HRV and 6 bpm over on resting HR, so the demo brief has
 *   something to explain.
 * - 14 days of food totals written by "MyMacros".
 * - 3 runs recorded on an Apple Watch in the last 2 weeks.
 * Deterministic for a given date: no Math.random.
 */
import type { HealthNutritionDay, ImportedWorkout, WearableDay } from '../physiology';

function isoLocal(offsetDays: number, base: Date): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A fixed wobble in −1…1 for day i, so the numbers look like real day-to-day variation but never change. */
const wobble = (i: number) => Math.round(Math.sin(i * 2.17 + 0.6) * 100) / 100;

/** MOCK: 28 days ending today, oldest first. */
export function demoWearableDays(now = new Date()): WearableDay[] {
  return Array.from({ length: 28 }, (_, k) => {
    const offset = k - 27; // −27 … 0
    const recent = offset >= -1; // the last 2 days run low on HRV and high on resting HR
    const hrv = recent ? 41 + wobble(k) : 48 + wobble(k) * 3;
    const rhr = recent ? 64 + Math.round(wobble(k)) : 58 + Math.round(wobble(k) * 1.5);
    return {
      date: isoLocal(offset, now),
      sleepHours: offset === -1 ? 6.1 : offset === 0 ? 5.9 : Math.round((7.6 + wobble(k) * 0.4) * 10) / 10,
      hrvMs: Math.round(hrv * 10) / 10,
      restingHr: rhr,
      activeKcal: Math.round(480 + wobble(k + 3) * 120),
      source: 'apple_health' as const,
    };
  });
}

/** MOCK: 14 days of food totals from "MyMacros" via Apple Health, ending yesterday. */
export function demoNutritionDays(now = new Date()): HealthNutritionDay[] {
  return Array.from({ length: 14 }, (_, k) => {
    const offset = k - 14; // −14 … −1
    const lean = offset >= -5 && k % 2 === 0; // a few lighter days lately
    const kcal = Math.round((lean ? 1450 : 1950) + wobble(k) * 120);
    return {
      date: isoLocal(offset, now),
      kcal,
      proteinG: Math.round((lean ? 85 : 115) + wobble(k + 1) * 10),
      carbsG: Math.round((lean ? 150 : 210) + wobble(k + 2) * 20),
      fatG: Math.round((lean ? 50 : 68) + wobble(k + 4) * 6),
      sources: ['MyMacros'],
    };
  });
}

/** MOCK: three runs recorded on an Apple Watch in the last 2 weeks (mornings, so they never overlap a demo session). */
export function demoImportedWorkouts(now = new Date()): ImportedWorkout[] {
  const runs: [daysAgo: number, minutes: number, km: number, avgHr: number, maxHr: number][] = [
    [12, 34, 5.2, 148, 168],
    [8, 41, 6.1, 151, 172],
    [3, 28, 4.3, 146, 165],
  ];
  return runs.map(([daysAgo, minutes, km, avgHr, maxHr], i) => {
    const date = isoLocal(-daysAgo, now);
    return {
      id: `mock-run-${i + 1}`,
      date,
      startedAt: `${date}T06:30:00.000Z`,
      durationMin: minutes,
      activity: 'run' as const,
      activeKcal: Math.round(minutes * 9.5),
      distanceM: Math.round(km * 1000),
      avgHr,
      maxHr,
      source: 'apple_health' as const,
      sourceApp: 'Apple Watch',
    };
  });
}
