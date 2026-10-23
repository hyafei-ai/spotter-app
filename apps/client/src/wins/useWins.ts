import { useMemo } from 'react';
import { HEALTH_WIN_KINDS, weeklyWins, type MastersInput, type MastersWinKind, type ProgressWin } from '@spotter/core';
import { DEMO_CLIENT, demoMastersInput } from '@spotter/core/demo';
import { IS_DEMO } from '../env';
import { localDate } from '../nutrition/store';
import { useApp } from '../store';
import { calibrationSessions } from '../cycle/store';
import { useHealthImports } from '../health/store';
import { useProgress } from '../brief/progress';

/** One win the client can see and share: masters wins (this week) and bests beyond raw PRs, newest first. */
export interface Win {
  id: string;
  kind: MastersWinKind | ProgressWin['kind'];
  text: string;
  date: string;
  /** Health data (watch readings, or a cycle phase): never put on a card unless the client picks it. */
  health: boolean;
}

/**
 * This week's wins (masters.ts weeklyWins) plus recent bests (progress.ts), without repeats of the same lift.
 * MOCK: the demo uses Jordan's sample history from @spotter/core/demo.
 */
export function useWins(): Win[] {
  const completed = useApp((s) => s.completed);
  const wearables = useHealthImports((s) => s.wearableDays);
  const { wins: bests } = useProgress();
  const today = localDate();
  return useMemo(() => {
    const input: MastersInput | null = IS_DEMO
      ? demoMastersInput(DEMO_CLIENT.id)
      : { sessions: calibrationSessions(completed).map((s) => ({ ...s })), wearables };
    const week = input ? weeklyWins(input, today) : [];
    const out: Win[] = week.map((w) => ({ id: `${w.kind}-${w.exerciseId ?? ''}-${w.date}`, kind: w.kind, text: w.text, date: w.date, health: HEALTH_WIN_KINDS.has(w.kind) }));
    const seen = new Set(week.map((w) => w.exerciseId).filter(Boolean));
    for (const b of bests.slice(0, 6)) {
      if (seen.has(b.exerciseId)) continue;
      seen.add(b.exerciseId);
      // A phase best names a cycle phase: that's health data, so it's never on a card unless picked.
      out.push({ id: `${b.kind}-${b.exerciseId}-${b.date}`, kind: b.kind, text: b.text, date: b.date, health: b.kind === 'phase_best' });
    }
    return out;
  }, [completed, wearables, bests, today]);
}
