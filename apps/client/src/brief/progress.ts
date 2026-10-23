import { useMemo } from 'react';
import {
  STARTER_LIBRARY,
  consistency,
  e1rmTrend,
  mainLifts,
  progressWins,
  versionFor,
  weekIndexFor,
  type CalibrationSession,
  type Consistency,
  type E1rmTrend,
  type ProgressWin,
} from '@spotter/core';
import { localDate } from '../nutrition/store';
import { useApp, type CompletedSession } from '../store';
import { useAssigned } from '../programs';
import { usePhaseOn } from './inputs';

/** Finished sessions as calibration sessions: only weighted sets with reps count toward bests. */
export function calibrationSessions(completed: CompletedSession[]): CalibrationSession[] {
  return completed.map((s) => ({
    date: s.date,
    feel: s.feel || null,
    sets: s.sets
      .filter((x) => x.weightKg != null && x.reps != null)
      .map((x) => ({ exerciseId: x.exerciseId, weightKg: x.weightKg!, reps: x.reps!, rpe: x.rpe })),
  }));
}

export interface ProgressView {
  wins: ProgressWin[];
  trends: E1rmTrend[];
  consistency: Consistency;
  /** Phase-calibrated bests are possible (cycle data exists). */
  phaseAware: boolean;
}

/** Wins beyond raw PRs, e1RM trends for the main lifts and consistency, from what's logged on the phone. */
export function useProgress(): ProgressView {
  const completed = useApp((s) => s.completed);
  const assignment = useAssigned((s) => s.assignment);
  const phaseOn = usePhaseOn();
  const today = localDate();
  return useMemo(() => {
    const sessions = calibrationSessions(completed);
    const names: Record<string, string> = Object.fromEntries(STARTER_LIBRARY.map((e) => [e.id, e.name]));
    for (const s of completed) for (const e of s.plan?.exercises ?? []) names[e.exerciseId] = e.name;
    let planned: number | null = null;
    if (assignment && today >= assignment.startDate) {
      const weeks = versionFor(assignment, today).program.weeks;
      planned = weeks[Math.min(weekIndexFor(assignment.startDate, today), weeks.length - 1)]?.days.length ?? null;
    }
    return {
      wins: progressWins({ sessions, phaseOn, names }),
      trends: mainLifts(sessions, today).map((id) => e1rmTrend(sessions, id, today, names)),
      consistency: consistency(
        completed.map((s) => s.date),
        today,
        8,
        planned,
      ),
      phaseAware: !!phaseOn,
    };
  }, [completed, assignment, phaseOn, today]);
}
