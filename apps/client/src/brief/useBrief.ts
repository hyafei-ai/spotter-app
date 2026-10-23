import { useCallback, useEffect, useMemo } from 'react';
import {
  dailyBrief,
  hrvStatus,
  monotonyStrain,
  ongoingPain,
  regionLoads,
  restingHrStatus,
  sharedBrief,
  type BriefInjury,
  type DailyBrief,
  type DailyCheck,
  type DailyRead,
  type InjurySession,
  type SessionPlan,
  type SharedBrief,
} from '@spotter/core';
import { tenant } from '../env';
import { localDate } from '../nutrition/store';
import { todayPlan, useApp, type CompletedSession } from '../store';
import { sessionLoads, useTodayRead } from '../daily/read';
import { useHealthStatus } from '../health/HealthRow';
import { useHealthImports, visibleWorkouts } from '../health/store';
import { importedSessions } from '../health/loads';
import { useInjury, type PainEntry } from '../injury/store';
import { useCalibrationToday, useCycleEstimate, useCycleShared, useFuelPattern, useFuelShared, useSymptomsToday } from './inputs';

/** Finished sessions as injury sessions: load plus one entry per logged set. */
export function injurySessions(completed: CompletedSession[]): InjurySession[] {
  const loads = sessionLoads(completed);
  return completed.map((s, i) => ({ date: s.date, load: loads[i]!.load, sets: s.sets.map((x) => ({ exerciseId: x.exerciseId })) }));
}

/** Pain, region load and monotony for today, from Spotter sessions plus imported workouts. */
export function useInjurySignals(): BriefInjury & { painShared: boolean; logs: PainEntry[] } {
  const completed = useApp((s) => s.completed);
  const logs = useInjury((s) => s.logs);
  const workouts = useHealthImports((s) => s.workouts);
  const hidden = useHealthImports((s) => s.hiddenActivities);
  const today = localDate();
  return useMemo(() => {
    const sessions = [...injurySessions(completed), ...importedSessions(visibleWorkouts(workouts, hidden), completed)];
    const pain = ongoingPain(logs, today);
    const top = pain[0];
    // The pain reason reaches the coach only if every recent log for that region was shared.
    const painShared = !top || logs.filter((l) => l.region === top.region && l.date <= today).every((l) => l.shareWithCoach);
    return { pain, regions: regionLoads(sessions, today), monotony: monotonyStrain(sessions, today), painShared, logs };
  }, [completed, logs, workouts, hidden, today]);
}

interface BriefContext {
  injury: BriefInjury;
  painShared: boolean;
  plan?: SessionPlan;
  restDay: boolean;
}

/**
 * Today's brief and the read it's built on. `plan` is today's session (for the easier version and for
 * naming the exercise that loads a painful region); without one, it's a rest day.
 */
export function useBrief(plan?: SessionPlan, restDay = !plan) {
  const { today, check, read } = useTodayRead();
  const ctx = useBriefContext(plan, restDay);
  const brief = useMemo(() => ctx.build(read), [ctx, read]);
  return { today, check, read, brief };
}

/** Everything but the read, so the daily check's live preview can build the brief from its own read. */
export function useBriefContext(plan?: SessionPlan, restDay = !plan) {
  const days = useHealthImports((s) => s.wearableDays);
  const status = useHealthStatus((s) => s.status);
  const cycle = useCycleEstimate();
  const calibration = useCalibrationToday();
  const fuel = useFuelPattern();
  const symptoms = useSymptomsToday();
  const fuelShared = useFuelShared();
  const cycleShared = useCycleShared();
  const injury = useInjurySignals();
  const today = localDate();

  // Pick up new health-app data when the screen opens or the connection changes.
  useEffect(() => {
    void useHealthImports.getState().refresh();
  }, [status]);

  // MOCK (demo): the coach app's Pain section shows region-load warnings from here.
  const spikeKey = injury.regions.map((r) => `${r.region}:${r.ratio}`).join(',');
  useEffect(() => {
    if (injury.regions.length) void useInjury.getState().publishRegions(injury.regions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spikeKey]);

  return useMemo(() => {
    const hrv = hrvStatus(days, today);
    const restingHr = restingHrStatus(days, today);
    const c: BriefContext = { injury, painShared: injury.painShared, plan, restDay };
    const build = (read: DailyRead): DailyBrief =>
      dailyBrief({
        read,
        hrv,
        restingHr,
        cycle,
        calibration,
        fuel,
        injury: c.injury,
        symptoms,
        hasLighter: !!plan && !restDay,
        coach: tenant.coach.name.split(' ')[0] ?? '',
        planned: plan?.exercises.map((e) => ({ exerciseId: e.exerciseId, name: e.name })),
        restDay,
      });
    /** What the coach may see of a brief, given that day's check. */
    const share = (brief: DailyBrief, check: DailyCheck | null): SharedBrief =>
      sharedBrief(brief, { shareCycle: cycleShared || !!check?.shareCycle, shareFuel: fuelShared, sharePain: c.painShared });
    return { build, share, hrv, restingHr };
  }, [days, today, cycle, calibration, fuel, symptoms, injury, plan, restDay, cycleShared, fuelShared]);
}

/** For the daily check (live preview and submit): today's plan, so the brief matches Today's. */
export function useTodayBriefContext() {
  const mode = useApp((s) => s.demo.todayMode);
  const plan = useMemo(() => todayPlan(mode) ?? undefined, [mode]);
  return useBriefContext(plan);
}

/** For the daily check's submit: the shared brief for a check and its read. */
export function useSharedBriefFor(): (check: DailyCheck, read: DailyRead) => SharedBrief {
  const ctx = useTodayBriefContext();
  return useCallback((check, read) => ctx.share(ctx.build(read), check), [ctx]);
}
