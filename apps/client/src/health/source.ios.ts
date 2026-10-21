import { Linking } from 'react-native';
import {
  CategoryValueSleepAnalysis,
  getMostRecentQuantitySample,
  isHealthDataAvailableAsync,
  queryCategorySamples,
  queryStatisticsForQuantity,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import { sleepWindow, startOfDay, type HealthSource } from './types';

const READ = ['HKQuantityTypeIdentifierStepCount', 'HKQuantityTypeIdentifierBodyMass', 'HKCategoryTypeIdentifierSleepAnalysis'] as const;
const ASLEEP = new Set<number>([
  CategoryValueSleepAnalysis.asleepUnspecified,
  CategoryValueSleepAnalysis.asleepCore,
  CategoryValueSleepAnalysis.asleepDeep,
  CategoryValueSleepAnalysis.asleepREM,
]);

/**
 * Apple Health (read only). iOS never says whether read access was denied (by design), so a
 * "granted" here means the prompt was answered; empty reads are shown as "No data yet".
 */
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
  openSettings: () => void Linking.openURL('x-apple-health://').catch(() => Linking.openSettings()),
};
