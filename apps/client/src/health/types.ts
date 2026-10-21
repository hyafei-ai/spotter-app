/** Read-only health data (C-10 "connected health app"): steps, bodyweight, sleep. */

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
