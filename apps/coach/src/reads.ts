import { dailyRead, sharedRead, type DailyCheck, type DailyRead } from '@spotter/core';
import { DEMO_CLIENTS, isoDay } from '@spotter/core/demo';

/*
 * INTEGRATOR: REPLACE THIS FILE with the athlete daily-check build's apps/coach/src/reads.ts.
 *
 * Stub of the shared-read contract so coach memory compiles and the demo has something to show:
 *   getSharedReads(clientId) → { date, read: DailyRead | null, submittedAt }[]
 * The real version reads the demo localStorage key `spotter.reads.<tenant>` (and Supabase when
 * connected). This stub returns MOCK reads for Jordan only: a steady start to the week, then three
 * short nights in a row with low energy on the last one.
 */

export interface SharedReadEntry {
  date: string;
  read: DailyRead | null;
  submittedAt: string;
}

const STEADY = { status: 'steady' as const, acute: 2100, chronicWeekly: 2000, ratio: 1.05 };

/* MOCK: Jordan's last seven daily checks (hours slept, energy 1–5), oldest first. */
const JORDAN_NIGHTS: [number, number][] = [
  [7.6, 4],
  [7.2, 4],
  [7.8, 3],
  [5.9, 3],
  [5.6, 3],
  [5.2, 2],
  [6.9, 3],
];

function mockJordan(): SharedReadEntry[] {
  const checks: DailyCheck[] = JORDAN_NIGHTS.map(([sleepHours, energy], i) => {
    const date = isoDay(i - (JORDAN_NIGHTS.length - 1));
    return {
      id: `mock-read-${date}`,
      date,
      sleepHours,
      sleepSource: 'manual',
      energy,
      soreness: 2,
      stress: 2,
      cyclePhase: null,
      shareCycle: false,
      note: null,
      shareWithCoach: true,
      submittedAt: `${date}T07:10:00.000Z`,
    };
  });
  return checks.map((check, i) => ({
    date: check.date,
    read: sharedRead(
      dailyRead({
        today: check.date,
        check,
        history: checks.slice(0, i + 1),
        load: STEADY,
        fuel: 'ok',
      }),
      check,
    ),
    submittedAt: check.submittedAt,
  }));
}

let cache: { day: string; jordan: SharedReadEntry[] } | null = null;
const NONE: SharedReadEntry[] = [];

export function getSharedReads(clientId: string): SharedReadEntry[] {
  if (clientId !== DEMO_CLIENTS[0]!.id) return NONE;
  const day = isoDay(0);
  if (!cache || cache.day !== day) cache = { day, jordan: mockJordan() };
  return cache.jordan;
}
