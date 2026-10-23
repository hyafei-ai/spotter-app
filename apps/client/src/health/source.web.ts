import type { HealthSource } from './types';

/** No health store on the web preview: nothing to read, nothing imported. */
export const health: HealthSource = {
  provider: null,
  isAvailable: async () => false,
  connect: async () => 'unavailable',
  readToday: async () => ({ steps: null, bodyweightKg: null, bodyweightAt: null, sleepHours: null }),
  readDays: async () => [],
  readNutritionDays: async () => [],
  readWorkouts: async () => [],
  connectCycle: async () => 'unavailable',
  readPeriods: async () => [],
  openSettings: () => {},
};
