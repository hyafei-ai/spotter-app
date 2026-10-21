import type { HealthSource } from './types';

/** No health store on the web preview. */
export const health: HealthSource = {
  provider: null,
  isAvailable: async () => false,
  connect: async () => 'unavailable',
  readToday: async () => ({ steps: null, bodyweightKg: null, bodyweightAt: null, sleepHours: null }),
  openSettings: () => {},
};
