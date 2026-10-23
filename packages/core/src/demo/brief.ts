/*
 * MOCK transport between the demo apps for the daily brief's pain section (readShared/writeShared in
 * @spotter/ui). Real builds use the pain_logs table (coach reads shared rows) and
 * imported_workouts_for_coach. Only logs the client shared are ever written here.
 */
import type { RegionLoad } from '../injury';
import type { PainLog } from '../physiology';

export interface SharedPainDoc {
  /** coach-side client id → pain logs the client shared, newest last (at most 30). */
  pain: Record<string, PainLog[]>;
  /** coach-side client id → this week's per-region load against usual (training data, already coach-visible). */
  regions: Record<string, { date: string; regions: RegionLoad[] }>;
}

export const EMPTY_SHARED_PAIN: SharedPainDoc = { pain: {}, regions: {} };
export const painKey = (tenantSlug: string) => `spotter.pain.${tenantSlug}`;
