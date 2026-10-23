/*
 * MOCK DATA: Apple Watch demo content for the web watch preview and the demo coach app. Every number is invented
 * sample data; nothing is a real person's result.
 */
import { WATCH_PAYLOAD_VERSION, sequentialOrder, type WatchBlock, type WatchHrRecovery, type WatchSessionPlan, type WatchSessionSummary } from '../watch';
import { isoDay } from './client';

const id = (n: number) => `0192f0a1-0000-7000-8000-${String(n).padStart(12, '0')}`;

/**
 * MOCK: a coach-written hybrid / Hyrox-style conditioning session, the kind of block the multi-sport program
 * model will produce. The loads are the coach's training choices in this sample, not race weights.
 */
const HYBRID_BLOCKS: WatchBlock[] = [
  { kind: 'interval', exerciseId: null, programExerciseId: null, name: 'Run', reps: 4, workSec: null, distanceM: 1000, restSec: 90, target: { kind: 'pace', secPerKm: 310 } },
  { kind: 'station', exerciseId: null, programExerciseId: null, name: 'SkiErg', distanceM: 500, reps: null, loadKg: null },
  { kind: 'station', exerciseId: null, programExerciseId: null, name: 'Sled push', distanceM: 25, reps: null, loadKg: 80 },
  { kind: 'station', exerciseId: null, programExerciseId: null, name: 'Wall balls', distanceM: null, reps: 50, loadKg: 6 },
  { kind: 'interval', exerciseId: null, programExerciseId: null, name: 'Bike', reps: 5, workSec: 60, distanceM: null, restSec: 60, target: { kind: 'hr_zone', zone: 4 } },
  { kind: 'timed', exerciseId: null, programExerciseId: null, name: 'Plank', seconds: 60 },
];

export const DEMO_WATCH_HYBRID: WatchSessionPlan = {
  v: WATCH_PAYLOAD_VERSION,
  planId: `${id(260)}:${isoDay(0)}:planned`,
  programDayId: id(260),
  date: isoDay(0),
  title: 'Hybrid engine',
  version: 'planned',
  label: 'Hybrid engine',
  coachNote: 'Even pace on the runs. Stations steady, not a race.',
  units: 'kg',
  incrementKg: 2.5,
  calibration: null,
  blocks: HYBRID_BLOCKS,
  order: sequentialOrder(HYBRID_BLOCKS),
};

/** MOCK: heart-rate numbers the preview shows on the recovery and done screens. */
export const DEMO_WATCH_HR = { now: 132, peak: 168, during: 141 };
export const DEMO_WATCH_RECOVERY: WatchHrRecovery = { peak: 168, at60: 137, at120: 118 };

/* ---------- demo transport: what the coach app reads (real builds: session_watch_summaries) ---------- */

export interface SharedWatchDoc {
  /** coach-side client id → watch session summaries the client shared, newest last (at most 20). */
  sessions: Record<string, (WatchSessionSummary & { title: string; date: string })[]>;
  /** coach-side client id → true while the client's "Heart rate from watch sessions" switch is off. */
  hidden?: Record<string, boolean>;
}
export const EMPTY_SHARED_WATCH: SharedWatchDoc = { sessions: {} };
export const watchKey = (tenantSlug: string) => `spotter.watch.${tenantSlug}`;

/** MOCK: two earlier watch sessions so the coach sees a recovery trend in the demo. */
export function demoWatchHistory(): (WatchSessionSummary & { title: string; date: string })[] {
  const mk = (days: number, title: string, avg: number, max: number, peak: number, d60: number, d120: number) => ({
    sessionId: id(270 + days),
    source: 'apple_watch' as const,
    avgHr: avg,
    maxHr: max,
    hrrPeak: peak,
    hrr60: d60,
    hrr120: d120,
    splits: [],
    recordedAt: `${isoDay(-days)}T18:40:00.000Z`,
    title,
    date: isoDay(-days),
  });
  return [mk(14, 'Lower A', 128, 162, 158, 24, 41), mk(7, 'Lower A', 126, 160, 157, 27, 44)];
}
