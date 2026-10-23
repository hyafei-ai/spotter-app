/*
 * MOCK DATA — two weeks of sample fuelling for the demo client (Jordan Ellis, 41, about 62 kg, body fat
 * not entered). Invented numbers, labelled as such. Food comes "from MyMacros via Apple Health" on most
 * days; training days run a few hundred kcal short of rest days, so the fuel check reads
 * "Reduced" energy availability and "Worth watching" (with a knee niggle and a small dip in estimated
 * max as the two other signs).
 */
import {
  exerciseForDay,
  ffmFor,
  fuelPattern,
  intakeForDay,
  type FuelCheck,
  type HealthNutritionDayLike,
  type IntakeSourcePref,
} from '../fuel';
import type { EnergyDay, FuelLevel, PainLog } from '../physiology';

export const DEMO_FUEL_BODYWEIGHT_KG = 62;
/** MOCK: the estimated-max trend progress.ts would report (−6% over 6 weeks). */
export const DEMO_E1RM_TREND_PCT = -6;

export interface FuelSettings {
  bodyFatPct: number | null;
  /** The athlete chose "Use an estimate" (assumes 30% body fat). */
  useEstimate: boolean;
  intakeSource: IntakeSourcePref;
  /** "Share fuel check level with {coach}". Off by default. */
  shareWithCoach: boolean;
}

export const DEFAULT_FUEL_SETTINGS: FuelSettings = { bodyFatPct: null, useEstimate: false, intakeSource: 'auto', shareWithCoach: false };
/** MOCK: the demo athlete has already chosen "Use an estimate", so the first open shows a result. */
export const DEMO_FUEL_SETTINGS: FuelSettings = { ...DEFAULT_FUEL_SETTINGS, useEstimate: true };

/*
 * MOCK transport between the demo apps (readShared/writeShared in @spotter/ui). Real builds use the
 * fuel_shares table; the coach sees only the level and the signs' text, never food logs or EA figures.
 */
export interface FuelShareEntry {
  date: string;
  level: FuelLevel;
  signs: string[];
  sharedAt: string;
}
/** coach-side client id → latest shared fuel check, or null when the athlete keeps it private. */
export type FuelSharesDoc = Record<string, FuelShareEntry | null>;
export const EMPTY_FUEL_SHARES: FuelSharesDoc = {};
export const fuelKey = (tenantSlug: string) => `spotter.fuel.${tenantSlug}`;

function isoLocal(offsetDays: number, base: Date): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Days −14 … −1: [kcal from MyMacros (null = nothing logged), training session minutes and feel (null = rest)]
const ROWS: [number | null, [number, number] | null][] = [
  [2000, null],
  [1700, [60, 3]],
  [1950, null],
  [1550, [60, 2]],
  [2050, null],
  [1680, [60, 3]],
  [null, null],
  [1980, null],
  [1500, [60, 3]],
  [1900, null],
  [1620, [60, 2]],
  [null, null],
  [1480, [60, 3]],
  [2020, null],
];

/** MOCK health-store food days, as the TODO-INTEGRATE health adapter would return them. */
export function demoHealthNutritionDays(now = new Date()): HealthNutritionDayLike[] {
  return ROWS.flatMap(([kcal], i) =>
    kcal == null
      ? []
      : [{ date: isoLocal(i - ROWS.length, now), kcal, proteinG: Math.round((kcal * 0.25) / 4), carbsG: Math.round((kcal * 0.45) / 4), fatG: Math.round((kcal * 0.3) / 9), sources: ['MyMacros'] }],
  );
}

/** MOCK training sessions over the same two weeks (minutes and finish-screen feel). */
export function demoFuelSessions(now = new Date()): { date: string; durationMin: number; feel: number | null }[] {
  return ROWS.flatMap(([, s], i) => (s ? [{ date: isoLocal(i - ROWS.length, now), durationMin: s[0], feel: s[1] }] : []));
}

/** MOCK: a knee niggle on three days in the last two weeks. */
export function demoPainLogs(now = new Date()): PainLog[] {
  return [-10, -6, -3].map((d, i) => ({
    id: `0192f0a6-0000-7000-8000-${String(i + 1).padStart(12, '0')}`,
    date: isoLocal(d, now),
    region: 'knee' as const,
    side: 'left' as const,
    level: 3,
    note: null,
  }));
}

export function demoEnergyDays(now = new Date()): EnergyDay[] {
  const health = demoHealthNutritionDays(now);
  const sessions = demoFuelSessions(now);
  return ROWS.map((_, i) => {
    const date = isoLocal(i - ROWS.length, now);
    const intake = intakeForDay(null, health.find((h) => h.date === date) ?? null, 'auto');
    return { date, intakeKcal: intake.kcal, ...exerciseForDay(sessions.filter((s) => s.date === date), DEMO_FUEL_BODYWEIGHT_KG, null) };
  });
}

/** The demo athlete's fuel check, as the client app computes it on first open. */
export function demoFuelCheck(now = new Date()): FuelCheck {
  const ffm = ffmFor(DEMO_FUEL_BODYWEIGHT_KG, DEMO_FUEL_SETTINGS.bodyFatPct, DEMO_FUEL_SETTINGS.useEstimate);
  return fuelPattern({
    today: isoLocal(0, now),
    days: demoEnergyDays(now),
    ffmKg: ffm?.kg ?? null,
    cycle: null,
    painLogs: demoPainLogs(now),
    e1rmTrendPct: DEMO_E1RM_TREND_PCT,
    checks: [],
    bodyweights: [{ date: isoLocal(-1, now), kg: DEMO_FUEL_BODYWEIGHT_KG }],
  });
}
