import { useEffect, useState } from 'react';
import type { RaceGoal } from '@spotter/core';
import { EMPTY_SHARED_RACE, raceGoalFrom, raceKey, type SharedRaceDoc } from '@spotter/core/demo';
import { onSharedChange, readShared, writeShared } from '@spotter/ui';
import { tenant } from '../env';

/*
 * A client's race goal on the coach side. Real builds read and write `race_goals` (the coach's RLS policy allows
 * writes for clients they can see) — TODO-INTEGRATE. MOCK (demo): shared storage with the client app on the web
 * preview, seeded with Sasha's race.
 */
const KEY = raceKey(tenant.slug);

export function useRaceGoal(clientId: string): { goal: RaceGoal | null; loaded: boolean; save(goal: RaceGoal | null): Promise<void> } {
  const [doc, setDoc] = useState<SharedRaceDoc | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => void readShared<SharedRaceDoc>(KEY, EMPTY_SHARED_RACE).then((d) => live && setDoc(d));
    load();
    const off = onSharedChange((k) => k === KEY && load());
    return () => {
      live = false;
      off();
    };
  }, []);
  return {
    loaded: doc != null,
    goal: doc ? raceGoalFrom(doc, clientId) : null,
    async save(goal) {
      const cur = await readShared<SharedRaceDoc>(KEY, EMPTY_SHARED_RACE);
      const next: SharedRaceDoc = { goals: { ...cur.goals, [clientId]: goal ? { ...goal, setBy: 'coach', updatedAt: new Date().toISOString() } : null } };
      await writeShared(KEY, next);
      setDoc(next);
    },
  };
}
