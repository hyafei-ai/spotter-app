import { useMemo } from 'react';
import {
  STARTER_LIBRARY,
  consistency,
  e1rmTrend,
  mainLifts,
  progressWins,
  scoreHistories,
  versionFor,
  weekIndexFor,
  type Consistency,
  type E1rmTrend,
  type ProgressWin,
  type ScoreHistory,
} from '@spotter/core';
import { tenant } from '../env';
import { localDate } from '../nutrition/store';
import { useApp } from '../store';
import { useAssigned } from '../programs';
import { usePhaseOn } from './inputs';
// Same sessions the calibration reads: the client's own, plus (demo only) the MOCK six months.
import { calibrationSessions } from '../cycle/store';

export interface ProgressView {
  wins: ProgressWin[];
  trends: E1rmTrend[];
  consistency: Consistency;
  /** Phase-calibrated bests are possible (cycle data exists). */
  phaseAware: boolean;
  /** Benchmarks, intervals and race sims, most recent first (blocks with a score). */
  histories: ScoreHistory[];
  /** More scored sessions than lifting ones: lead with scores. */
  scoresFirst: boolean;
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
    const scored = completed.filter((c) => c.results?.length).map((c) => ({ date: c.date, results: c.results! }));
    const lifting = completed.filter((c) => c.sets.some((x) => x.weightKg != null)).length;
    return {
      wins: progressWins({ sessions, phaseOn, names, scored }),
      histories: scoreHistories(scored, tenant.units),
      scoresFirst: scored.length > lifting,
      trends: mainLifts(sessions, today).map((id) => e1rmTrend(sessions, id, today, names)),
      consistency: consistency(
        sessions.map((s) => s.date),
        today,
        8,
        planned,
      ),
      phaseAware: !!phaseOn,
    };
  }, [completed, assignment, phaseOn, today]);
}
