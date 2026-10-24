import { useMemo } from 'react';
import { router } from 'expo-router';
import { describeLighter, isStrengthOnly, planSummary, type SessionPlan } from '@spotter/core';
import { useApp } from '../store';
import { useDaily } from '../daily/store';
import { useLighterRule } from '../daily/read';
import { lighterPlan, recoveryPlan } from '../daily/options';
import { tenant } from '../env';

export type Version = 'planned' | 'lighter' | 'recovery';

export interface VersionOption {
  version: Version;
  /** "Lower A", "Lower A · easier version", "Recovery". */
  title: string;
  /** One line: what changes. */
  detail: string;
  plan: SessionPlan;
}

/**
 * The versions of today's session the client can choose: as planned, the coach's easier version, and the
 * coach's recovery day (only when the coach wrote one). The brief recommends one; the client always chooses.
 */
export function useVersions(plan: SessionPlan | null, suggestLighter: boolean) {
  const rule = useLighterRule();
  const completed = useApp((s) => s.completed);
  const startSession = useApp((s) => s.startSession);
  const recordVariant = useDaily((s) => s.recordVariant);
  const first = tenant.coach.name.split(' ')[0] ?? '';

  const options = useMemo<VersionOption[]>(() => {
    if (!plan) return [];
    const out: VersionOption[] = [
      {
        version: 'planned',
        title: plan.title,
        detail: `As ${first} planned it · ${isStrengthOnly(plan) ? `${plan.exercises.length} exercises` : planSummary(plan, tenant.units).join(', ')}`,
        plan,
      },
      {
        version: 'lighter',
        title: `${plan.title} · easier version`,
        detail: `${first}’s easier settings: ${describeLighter(rule).toLowerCase()}${isStrengthOnly(plan) ? '' : '. Timed parts stay as written: pace them easier'}`,
        plan: lighterPlan(plan, rule),
      },
    ];
    const rec = recoveryPlan(plan.scheduledDate, completed);
    if (rec) out.push({ version: 'recovery', title: rec.title, detail: `${first}’s recovery session instead`, plan: rec });
    return out;
  }, [plan, rule, completed, first]);

  const recommended: Version = suggestLighter ? 'lighter' : 'planned';

  const start = async (o: VersionOption) => {
    if (!plan) return;
    if (o.version === 'planned') {
      const id = await startSession(o.plan);
      router.push(`/session/${id}`);
      return;
    }
    const id = await startSession(o.plan, o.version);
    void recordVariant(id, o.plan.scheduledDate, plan.title, o.version);
    router.push(`/session/${id}`);
  };

  return { options, recommended, start };
}
