import { applyLighter, e1rmByExercise, fromDisplay, resolveDay, versionFor, weekIndexFor, type LighterRule, type SessionPlan } from '@spotter/core';
import { tenant } from '../env';
import { useAssigned } from '../programs';
import type { CompletedSession } from '../store';

const RECOVERY = /\brecovery\b/i;

/** The coach's lighter version of today's plan: same exercises, the coach's rule applied to sets and loads. */
export function lighterPlan(plan: SessionPlan, rule: LighterRule): SessionPlan {
  return { ...plan, exercises: applyLighter(plan.exercises, rule, fromDisplay(tenant.weightIncrement, tenant.units)) };
}

/**
 * A recovery session the coach wrote into the client's program (a day titled "recovery"), resolved for
 * today. Coach-owned content only: if the coach hasn't written one, there is no recovery option.
 */
export function recoveryPlan(date: string, completed: CompletedSession[]): SessionPlan | null {
  const a = useAssigned.getState().assignment;
  if (!a || date < a.startDate) return null;
  const weeks = versionFor(a, date).program.weeks;
  const current = Math.min(weekIndexFor(a.startDate, date), weeks.length - 1);
  // Prefer this week's recovery day, then the nearest other week's.
  const order = weeks.map((w, i) => ({ w, d: Math.abs(i - current) })).sort((x, y) => x.d - y.d);
  for (const { w } of order) {
    const day = w.days.find((d) => RECOVERY.test(d.title));
    if (day) return resolveDay(day, date, e1rmByExercise(completed.flatMap((s) => s.sets)), fromDisplay(tenant.weightIncrement, tenant.units));
  }
  return null;
}
