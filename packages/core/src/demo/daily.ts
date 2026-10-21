/*
 * MOCK DATA — sample daily checks for the demo client (Jordan Ellis). Invented numbers, labelled as such.
 * The last two nights are short, so the first read on open says "keep an eye on it" (one strain factor).
 */
import type { DailyCheck, DailyRead, LighterRule } from '../signals';

/*
 * MOCK transport between the demo apps (readShared/writeShared in @spotter/ui). Real builds use the
 * daily_checks table and the shared_reads_for_coach RPC; the coach never reads private fields.
 */
export type SessionVariant = 'planned' | 'lighter' | 'recovery';

export interface SharedReadEntry {
  date: string;
  submittedAt: string;
  /** False when the client kept that day's read private; read is then null. */
  shared: boolean;
  read: DailyRead | null;
}

export interface SharedReadsDoc {
  /** coach-side client id → recent entries, newest last (at most 14). */
  reads: Record<string, SharedReadEntry[]>;
  /** coach-side client id → sessions done as a different version than planned. */
  variants: Record<string, { date: string; title: string; variant: SessionVariant }[]>;
}

export const EMPTY_SHARED_READS: SharedReadsDoc = { reads: {}, variants: {} };
export const readsKey = (tenantSlug: string) => `spotter.reads.${tenantSlug}`;
/** coach-side client id → the coach's lighter rule for that client. */
export const lighterKey = (tenantSlug: string) => `spotter.lighter.${tenantSlug}`;
export type LighterRules = Record<string, LighterRule>;

const id = (n: number) => `0192f0a5-0000-7000-8000-${String(n).padStart(12, '0')}`;

function isoLocal(offsetDays: number, base: Date): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fourteen days before today, oldest first. Today is left for the client to fill in. */
export function demoDailyChecks(now = new Date()): DailyCheck[] {
  // hours slept, energy, soreness, stress — days -14 … -1
  const rows: [number, number, number, number][] = [
    [7.8, 4, 2, 2],
    [7.4, 4, 3, 2],
    [8.1, 4, 2, 2],
    [7.6, 3, 3, 3],
    [7.9, 4, 2, 2],
    [7.2, 3, 3, 2],
    [8.0, 4, 2, 2],
    [7.7, 4, 2, 2],
    [7.5, 3, 3, 3],
    [8.2, 4, 2, 2],
    [7.6, 4, 2, 2],
    [7.3, 3, 3, 3],
    [5.9, 3, 3, 3],
    [6.1, 3, 2, 3],
  ];
  return rows.map(([sleepHours, energy, soreness, stress], i) => {
    const date = isoLocal(i - rows.length, now);
    return {
      id: id(i + 1),
      date,
      sleepHours,
      sleepSource: 'manual' as const,
      energy,
      soreness,
      stress,
      cyclePhase: null,
      shareCycle: false,
      note: null,
      shareWithCoach: true,
      submittedAt: `${date}T07:10:00.000Z`,
    };
  });
}
