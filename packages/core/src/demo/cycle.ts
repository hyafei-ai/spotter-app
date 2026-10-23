/*
 * MOCK DATA: cycle logs and six months of strength sessions for the demo athlete (Jordan Ellis, 41).
 * Invented numbers, labelled as such. Dates are relative to today, like demo/daily.ts, so the demo
 * always opens in the luteal phase (day 22 of about 29) with a calibration that's ready: the sample
 * lifts run about 4% under baseline in the luteal phase, deepest in the last few days before a period.
 */
import type { CyclePhase } from '../signals';
import type { CalibrationSession, CycleProfile, PeriodLog } from '../physiology';

/* ---------- MOCK transport between the demo apps (readShared/writeShared in @spotter/ui) ---------- */

/**
 * What the coach may see, and only when the athlete turned sharing on: today's phase and the
 * calibration summary. Never period dates, cycle day, symptoms or the mode. Real builds read the
 * same projection from the cycle_shared_for_coach(client) RPC.
 */
export interface SharedCycle {
  shared: boolean;
  /** Date the projection was computed for. */
  date: string;
  phase: CyclePhase | null;
  calibration: { method: string; ready: boolean; summary: string; appliedPctToday: number } | null;
  updatedAt: string;
}
/** coach-side client id → shared projection. */
export type SharedCycleDoc = Record<string, SharedCycle>;
export const cycleKey = (tenantSlug: string) => `spotter.cycle.${tenantSlug}`;

function isoLocal(offsetDays: number, base: Date): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** MOCK cycle lengths, oldest first (27–31 days, typical 29). The last period started 21 days ago. */
const LENGTHS = [29, 28, 30, 27, 31, 29];
const LAST_START = -21;

/** Day offsets (relative to today) of each period start, oldest first. */
function startOffsets(): number[] {
  const out = [LAST_START];
  for (let i = LENGTHS.length - 1; i >= 0; i--) out.unshift(out[0]! - LENGTHS[i]!);
  return out;
}

export function demoPeriods(now = new Date()): PeriodLog[] {
  return startOffsets().map((o, i) => ({ start: isoLocal(o, now), end: isoLocal(o + (i % 2 ? 4 : 5), now), source: 'manual' as const }));
}

/** MOCK: Jordan tracks a natural cycle, keeps it private by default. */
export function demoCycleProfile(now = new Date()): CycleProfile {
  return { mode: 'natural', periods: demoPeriods(now), birthYear: now.getFullYear() - 41, shareWithCoach: false };
}

/** MOCK top-set e1RMs (kg) for the three lifts; real ids from the demo exercise library. */
const LIFTS: { exerciseId: string; e1rm: number }[] = [
  { exerciseId: 'back-squat', e1rm: 90 },
  { exerciseId: 'bench-press', e1rm: 55 },
  { exerciseId: 'deadlift', e1rm: 110 },
];

/**
 * About six months of MOCK sessions, every 2–3 days, three working sets of 5 per lift. Deterministic:
 * small fixed "noise" (±0.8%) plus a luteal dip of 3.5%, 5% in the last five days before a period.
 * Loads use 0.5 kg steps so the dip isn't hidden by plate rounding.
 */
export function demoCycleSessions(now = new Date()): CalibrationSession[] {
  const starts = startOffsets();
  const sessions: CalibrationSession[] = [];
  let i = 0;
  for (let o = -182; o <= -1; o += i % 3 === 2 ? 3 : 2, i++) {
    const startIdx = starts.findIndex((s, k) => s <= o && (starts[k + 1] ?? Infinity) > o);
    let dip = 0;
    if (startIdx >= 0) {
      const length = LENGTHS[startIdx] ?? 29; // the current cycle: typical length
      const day = o - starts[startIdx]! + 1;
      const toNext = length - day + 1;
      if (toNext <= 13) dip = toNext <= 5 ? -5 : -3.5;
    }
    const noise = ((((i * 37) % 11) - 5) / 5) * 0.8;
    const factor = 1 + (dip + noise) / 100;
    sessions.push({
      date: isoLocal(o, now),
      feel: dip < 0 ? 3 : 4,
      sets: LIFTS.flatMap((l) =>
        [0, 1, 2].map(() => ({ exerciseId: l.exerciseId, weightKg: Math.round(((l.e1rm * factor) / (1 + 5 / 30)) * 2) / 2, reps: 5, rpe: null })),
      ),
    });
  }
  return sessions;
}
