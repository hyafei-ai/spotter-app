import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LIGHTER,
  dailyRead,
  fuelStatus,
  loadTrend,
  sessionLoad,
  type DailyCheck,
  type DailyRead,
  type LighterRule,
} from '@spotter/core';
import { useApp, type CompletedSession } from '../store';
import { useNutrition, localDate } from '../nutrition/store';
import { useNutritionSetup } from '../nutrition/setup';
import { isOn } from '../modules';
import { loadLighterRule, useDaily } from './store';
import { useHealthImports, visibleWorkouts } from '../health/store';
import { importedSessions } from '../health/loads';

/** Session load from finished sessions: minutes × the session RPE implied by "how did it feel". */
export function sessionLoads(completed: CompletedSession[]): { date: string; load: number }[] {
  return completed.map((s) => {
    const minutes = Math.max(0, (Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 60_000);
    return { date: s.date, load: sessionLoad(minutes, s.feel || null) };
  });
}

interface ReadInputs {
  checks: DailyCheck[];
  completed: CompletedSession[];
  kcalByDay: { date: string; kcal: number }[];
  targetKcal: number | null;
  /** Load from workouts imported from the health app (runs, rides, classes), already de-duplicated. */
  extraLoads?: { date: string; load: number }[];
}

/** Pure: the read for a date given everything on the phone. Exported for the check screen's live preview. */
export function readFor(today: string, check: DailyCheck | null, inputs: ReadInputs): DailyRead {
  const history = [...inputs.checks.filter((c) => c.date !== today), ...(check ? [check] : [])];
  return dailyRead({
    today,
    check,
    history,
    load: loadTrend([...sessionLoads(inputs.completed), ...(inputs.extraLoads ?? [])], today),
    fuel: fuelStatus(inputs.kcalByDay, inputs.targetKcal, today),
  });
}

/** Everything the read needs, from the stores. Fuelling only counts when nutrition is on and in macros mode. */
export function useReadInputs(): ReadInputs {
  const checks = useDaily((s) => s.checks);
  const completed = useApp((s) => s.completed);
  const entries = useNutrition((s) => s.entries);
  const setup = useNutritionSetup();
  const workouts = useHealthImports((s) => s.workouts);
  const hidden = useHealthImports((s) => s.hiddenActivities);
  return useMemo(() => {
    const macros = isOn('nutrition') && setup?.targets.mode === 'macros' ? (setup.targets.macros?.kcal ?? null) : null;
    const byDay = new Map<string, number>();
    for (const e of entries) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.macros.kcal);
    const extraLoads = importedSessions(visibleWorkouts(workouts, hidden), completed).map(({ date, load }) => ({ date, load }));
    return { checks, completed, kcalByDay: [...byDay].map(([date, kcal]) => ({ date, kcal })), targetKcal: macros, extraLoads };
  }, [checks, completed, entries, setup, workouts, hidden]);
}

/** Today's read and today's check (if any). */
export function useTodayRead(): { today: string; check: DailyCheck | null; read: DailyRead } {
  const inputs = useReadInputs();
  const today = localDate();
  const check = inputs.checks.find((c) => c.date === today) ?? null;
  const read = useMemo(() => readFor(today, check, inputs), [today, check, inputs]);
  return { today, check, read };
}

/** The coach's lighter rule for this client, re-read whenever the screen mounts. */
export function useLighterRule(): LighterRule {
  const [rule, setRule] = useState<LighterRule>(DEFAULT_LIGHTER);
  useEffect(() => {
    let live = true;
    void loadLighterRule().then((r) => live && setRule(r));
    return () => {
      live = false;
    };
  }, []);
  return rule;
}
