import type { HealthNutritionDay, HealthPeriod, ImportedWorkout, WearableDay } from './physiology';

/**
 * The device layer (docs/features/sources.md): where a client's data comes from and how it's normalised
 * into Spotter's own shapes (WearableDay, ImportedWorkout, HealthNutritionDay, HealthPeriod), so every
 * read, pattern and win works the same whatever the client wears.
 *
 * Today two sources are live, both through the phone's health store: Apple Health (iOS) and Health
 * Connect (Android). Watches and rings that write to those stores reach Spotter through them. Direct
 * vendor APIs are listed as stubs only: what each would provide is "to verify" in the doc, and each needs
 * a partner approval, an OAuth app and a terms review before any code is written.
 */

export const DATA_KINDS = ['sleep', 'hrv', 'resting_hr', 'workouts', 'nutrition', 'cycle', 'mobility', 'active_energy'] as const;
export type DataKind = (typeof DATA_KINDS)[number];

export type DataSourceId = 'apple_health' | 'health_connect' | 'garmin' | 'oura' | 'whoop' | 'fitbit' | 'polar' | 'manual';

export interface DataSource {
  id: DataSourceId;
  label: string;
  /** os_aggregator: the phone's health store; vendor_api: the device maker's cloud API; aggregator_service: a third party (e.g. Terra, Junction). */
  via: 'os_aggregator' | 'vendor_api' | 'aggregator_service';
  /** What Spotter reads from it. For vendor APIs this is the intended scope, to verify against the vendor's docs. */
  provides: DataKind[];
  status: 'live' | 'planned';
}

export const DATA_SOURCES: DataSource[] = [
  { id: 'apple_health', label: 'Apple Health', via: 'os_aggregator', provides: ['sleep', 'hrv', 'resting_hr', 'workouts', 'nutrition', 'cycle', 'mobility', 'active_energy'], status: 'live' },
  { id: 'health_connect', label: 'Health Connect', via: 'os_aggregator', provides: ['sleep', 'hrv', 'resting_hr', 'workouts', 'nutrition', 'cycle', 'mobility', 'active_energy'], status: 'live' },
  // Typed in on the phone; grouped with the phone's own data.
  { id: 'manual', label: 'Entered in Spotter', via: 'os_aggregator', provides: ['sleep', 'nutrition', 'cycle', 'mobility'], status: 'live' },
  // Planned, to verify: scopes below are what Spotter would ask for, not a statement of what each API offers.
  { id: 'garmin', label: 'Garmin', via: 'vendor_api', provides: ['sleep', 'hrv', 'resting_hr', 'workouts', 'active_energy'], status: 'planned' },
  { id: 'oura', label: 'Oura', via: 'vendor_api', provides: ['sleep', 'hrv', 'resting_hr', 'workouts'], status: 'planned' },
  { id: 'whoop', label: 'WHOOP', via: 'vendor_api', provides: ['sleep', 'hrv', 'resting_hr', 'workouts'], status: 'planned' },
  { id: 'fitbit', label: 'Fitbit', via: 'vendor_api', provides: ['sleep', 'hrv', 'resting_hr', 'workouts', 'active_energy'], status: 'planned' },
  { id: 'polar', label: 'Polar', via: 'vendor_api', provides: ['sleep', 'resting_hr', 'workouts'], status: 'planned' },
];

/** What every adapter produces: Spotter's own shapes, nothing vendor-specific. */
export interface NormalizedBatch {
  wearableDays: WearableDay[];
  workouts: ImportedWorkout[];
  nutrition: HealthNutritionDay[];
  periods: HealthPeriod[];
}

export const EMPTY_BATCH: NormalizedBatch = { wearableDays: [], workouts: [], nutrition: [], periods: [] };

/**
 * Turns one source's payload into Spotter's shapes. Rules every adapter keeps:
 * - HRV keeps its source: values from different sources (SDNN vs RMSSD, or a vendor's own method) are never compared.
 * - Missing means null, never 0.
 * - Dates are the client's local calendar day (sleep counts on the morning it ends).
 */
export interface SourceAdapter<Payload = unknown> {
  source: DataSourceId;
  normalize(payload: Payload): NormalizedBatch;
}

/**
 * What the phone's health store hands back after the client app has read it (apps/client/src/health/
 * source.ios.ts and source.android.ts already map HealthKit and Health Connect records into these shapes).
 */
export interface OsHealthPayload {
  days: WearableDay[];
  workouts: ImportedWorkout[];
  nutrition: HealthNutritionDay[];
  periods: HealthPeriod[];
}

function osAdapter(source: 'apple_health' | 'health_connect'): SourceAdapter<OsHealthPayload> {
  return {
    source,
    normalize: (p) => ({
      // Keep only this store's rows, so a mixed batch never blends HRV methods.
      wearableDays: p.days.filter((d) => d.source === source),
      workouts: p.workouts.filter((w) => w.source === source && w.durationMin >= 0),
      nutrition: p.nutrition.filter((n) => n.kcal == null || n.kcal >= 0),
      periods: p.periods,
    }),
  };
}

export const appleHealthAdapter = osAdapter('apple_health');
export const healthConnectAdapter = osAdapter('health_connect');

/** A documented stub: throws so a planned source can't be wired up by accident. */
function plannedAdapter(source: DataSourceId): SourceAdapter {
  return {
    source,
    normalize() {
      throw new Error(`${source}: direct API not built yet (see docs/features/sources.md: partner approval, OAuth app and terms first).`);
    },
  };
}

export const SOURCE_ADAPTERS: Partial<Record<DataSourceId, SourceAdapter>> = {
  apple_health: appleHealthAdapter as SourceAdapter,
  health_connect: healthConnectAdapter as SourceAdapter,
  garmin: plannedAdapter('garmin'),
  oura: plannedAdapter('oura'),
  whoop: plannedAdapter('whoop'),
  fitbit: plannedAdapter('fitbit'),
  polar: plannedAdapter('polar'),
};
