import { useMemo } from 'react';
import {
  e1rmTrend,
  exerciseForDay,
  exerciseKcalEstimate,
  ffmFor,
  fuelPattern,
  intakeForDay,
  mainLifts,
  sumMacros,
  type DayIntake,
  type EnergyDay,
  type FfmResult,
  type FuelCheck,
  type HealthNutritionDayLike,
  type Macros,
} from '@spotter/core';
import { DEMO_E1RM_TREND_PCT, DEMO_HISTORY, demoFuelSessions, demoPainLogs } from '@spotter/core/demo';
import { useApp, type CompletedSession } from '../store';
import { localDate, useNutrition } from '../nutrition/store';
import { useDaily } from '../daily/store';
import { IS_DEMO } from '../env';
import { useCycleToday } from '../cycle/hooks';
import { calibrationSessions } from '../cycle/store';
import { useInjury } from '../injury/store';
import { healthProvider, useHealthIntake } from './healthIntake';
import { useFuel } from './store';

export interface FuelDay extends EnergyDay {
  intake: DayIntake;
}

export interface FuelView {
  today: string;
  ffm: FfmResult | null;
  /** The last 14 days plus today, oldest first. */
  days: FuelDay[];
  check: FuelCheck;
  healthConnected: boolean;
}

const DEMO_SESSION_IDS = new Set(DEMO_HISTORY.map((s) => s.sessionId));
const minutes = (s: Pick<CompletedSession, 'startedAt' | 'finishedAt'>) => Math.max(0, (Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 60_000);

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

/** Spotter's own log for a day as one total, or null when nothing was logged there. */
export function spotterDay(entries: { date: string; macros: Macros }[], date: string): Macros | null {
  const day = entries.filter((e) => e.date === date);
  return day.length ? sumMacros(day) : null;
}

export function healthDay(days: HealthNutritionDayLike[], date: string): HealthNutritionDayLike | null {
  return days.find((d) => d.date === date) ?? null;
}

/** The session energy the training-day target adds: a finished session's minutes, else a 60-minute plan. */
export function sessionKcalFor(durationMin: number | null, feel: number | null, bodyweightKg: number | null): number | null {
  if (bodyweightKg == null) return null;
  return exerciseKcalEstimate({ durationMin: durationMin ?? 60, feel }, bodyweightKg).kcal;
}

/**
 * Everything the fuel check needs, from the stores: today's cycle estimate (cycle.ts), pain logs
 * (injury store) and the main lifts' estimated-max trend (progress.ts). The demo uses MOCK pain logs and
 * trend from @spotter/core/demo.
 */
/** The steepest 6-week estimated-max trend across the main lifts, as % (null under 3 sessions a lift). */
function worstTrendPct(completed: Parameters<typeof calibrationSessions>[0], today: string): number | null {
  const sessions = calibrationSessions(completed);
  const slopes = mainLifts(sessions, today)
    .map((id) => e1rmTrend(sessions, id, today).slopePct)
    .filter((p): p is number => p != null);
  return slopes.length ? Math.min(...slopes) : null;
}

export function useFuelCheck(): FuelView {
  const settings = useFuel((s) => s.settings);
  const bodyweightKg = useFuel((s) => s.bodyweightKg);
  const entries = useNutrition((s) => s.entries);
  const completed = useApp((s) => s.completed);
  const checks = useDaily((s) => s.checks);
  const { days: healthDays, connected } = useHealthIntake();
  const today = localDate();
  const painLogs = useInjury((s) => s.logs);
  const { estimate: cycleToday } = useCycleToday();
  const cycle = cycleToday.mode === 'not_tracking' ? null : cycleToday;

  return useMemo(() => {
    const ffm = ffmFor(bodyweightKg, settings.bodyFatPct, settings.useEstimate);
    const provider = healthProvider();
    const sessions = [
      // The demo's two sample sessions are replaced by the fuel demo's fortnight of training.
      ...completed.filter((s) => !IS_DEMO || !DEMO_SESSION_IDS.has(s.sessionId)).map((s) => ({ date: s.date, durationMin: minutes(s), feel: s.feel || null })),
      // MOCK: two weeks of sample training so the demo has something to read.
      ...(IS_DEMO ? demoFuelSessions() : []),
    ];
    const days: FuelDay[] = [];
    for (let i = -14; i <= 0; i++) {
      const date = shiftDate(today, i);
      const intake = intakeForDay(spotterDay(entries, date), healthDay(healthDays, date), settings.intakeSource, provider);
      days.push({
        date,
        intake,
        intakeKcal: intake.kcal,
        // TODO-INTEGRATE: the wearable's active kcal during workouts, when the health read has it.
        ...exerciseForDay(sessions.filter((s) => s.date === date), bodyweightKg, null),
      });
    }
    const check = fuelPattern({
      today,
      days,
      ffmKg: ffm?.kg ?? null,
      cycle,
      // MOCK in the demo until the athlete logs pain themselves.
      painLogs: IS_DEMO && painLogs.length === 0 ? demoPainLogs() : painLogs,
      e1rmTrendPct: IS_DEMO ? DEMO_E1RM_TREND_PCT : worstTrendPct(completed, today),
      checks,
      bodyweights: bodyweightKg != null ? [{ date: today, kg: bodyweightKg }] : [],
    });
    return { today, ffm, days, check, healthConnected: connected };
  }, [settings, bodyweightKg, entries, completed, checks, healthDays, connected, today, cycle, painLogs]);
}
