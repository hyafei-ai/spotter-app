import {
  SdkAvailabilityStatus,
  aggregateRecord,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
} from 'react-native-health-connect';
import { sleepWindow, startOfDay, type HealthSource } from './types';

const PERMISSIONS = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'SleepSession' },
] as const;

// Sleep stage types that count as asleep (Health Connect SleepStageType: 1 sleeping, 4 light, 5 deep, 6 REM).
const ASLEEP_STAGES = new Set([1, 4, 5, 6]);

async function ready(): Promise<boolean> {
  try {
    if ((await getSdkStatus()) !== SdkAvailabilityStatus.SDK_AVAILABLE) return false;
    return await initialize();
  } catch {
    return false;
  }
}

/** Health Connect (read only). */
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
  openSettings: () => openHealthConnectSettings(),
};
