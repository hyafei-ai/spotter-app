import { useEffect, useState } from 'react';
import { daysToRace, uuidv7, type RaceGoal } from '@spotter/core';
import { DEMO_CLIENT, EMPTY_SHARED_RACE, coachClientIdFor, isoDay, raceGoalFrom, raceKey, type SharedRaceDoc } from '@spotter/core/demo';
import { onSharedChange, readShared, writeShared } from '@spotter/ui';
import { tenant } from '../env';
import { syncQueue } from '../sync';

/*
 * The client's race goal (Me → Race goal; Today's countdown). Saved through the offline queue (race.goal.set /
 * race.goal.clear → race_goals); the coach sees it on the client page. Real builds read it back from sync pull
 * (`race_goals`) — TODO-INTEGRATE the pulled cache. MOCK (demo): shared storage with the coach app on the web preview.
 */
const KEY = raceKey(tenant.slug);
const me = () => coachClientIdFor(DEMO_CLIENT.id);

export function useMyRaceGoal(): { goal: RaceGoal | null; loaded: boolean; save(goal: RaceGoal | null): Promise<void> } {
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
    goal: doc ? raceGoalFrom(doc, me()) : null,
    async save(goal) {
      const cur = await readShared<SharedRaceDoc>(KEY, EMPTY_SHARED_RACE);
      const prev = cur.goals[me()] as (RaceGoal & { goalId?: string }) | null | undefined;
      const goalId = prev?.goalId ?? uuidv7();
      const at = new Date().toISOString();
      if (goal) await syncQueue.enqueue('race.goal.set', { goalId, ...goal, updatedAt: at });
      else if (prev) await syncQueue.enqueue('race.goal.clear', { goalId, clearedAt: at });
      void syncQueue.flush();
      const next: SharedRaceDoc = { goals: { ...cur.goals, [me()]: goal ? { ...goal, goalId, setBy: 'client', updatedAt: at } : null } };
      await writeShared(KEY, next);
      setDoc(next);
    },
  };
}

/** Today's countdown line, only inside 12 weeks and only before the race: "Spring race in 23 days". */
export function countdownLine(goal: RaceGoal | null, today = isoDay(0)): string | null {
  if (!goal) return null;
  const d = daysToRace(goal.date, today);
  if (d < 0 || d > 84) return null;
  return d === 0 ? `${goal.event} is today` : d === 1 ? `${goal.event} is tomorrow` : `${goal.event} in ${d} days`;
}
