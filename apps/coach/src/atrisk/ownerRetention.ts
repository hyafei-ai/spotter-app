import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import {
  mrrAtRisk,
  mrrAtRiskTrend,
  mrrFromRow,
  mrrKept,
  ownerRoster,
  snapshotFromRow,
  type MrrAtRiskDbRow,
  type MrrAtRiskRow,
  type MrrKeptRow,
  type MrrSnapshot,
  type MrrSnapshotDbRow,
  type MrrTrend,
} from '@spotter/core';
import { DEMO_PLANS, demoMemberActivity, demoMrrSnapshots } from '@spotter/core/demo';
import { isConfigured, supabase } from '@spotter/ui/platform';
import { tenant } from '../env';
import { useTeam } from '../platform/team';
import { useRetention } from '../retention/store';
import { localToday, usePhysiologyMap } from './inputs';

/*
 * Owner job (docs/jtbd.md): live MRR at risk, its 12-week trend, and MRR kept after a check-in.
 * Engagement and money only; physiology reaches the owner as a coach flag with no detail (ownerView).
 * Demo: MOCK member activity, shared physiology and earlier weeks from @spotter/core/demo, recomputed
 * on load. Connected: mrr_at_risk(tenant) and the owner-only mrr_at_risk_snapshots table.
 */

const isDemo = () => !isConfigured() || !supabase;

interface LiveState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  rows: MrrAtRiskRow[];
  snapshots: MrrSnapshot[];
  load(): Promise<void>;
}

/** Connected builds only. */
const useLiveMrr = create<LiveState>((set, get) => ({
  status: 'idle',
  rows: [],
  snapshots: [],
  async load() {
    set({ status: get().status === 'ready' ? 'ready' : 'loading' });
    const since = new Date(Date.now() - 12 * 7 * 86_400_000).toISOString().slice(0, 10);
    const [live, snaps] = await Promise.all([
      supabase!.rpc('mrr_at_risk', { tenant: tenant.id }),
      supabase!.from('mrr_at_risk_snapshots').select('week_start, currency, high_cents, medium_cents, members').eq('tenant_id', tenant.id).gte('week_start', since),
    ]);
    if (live.error || snaps.error) {
      set({ status: get().status === 'ready' ? 'ready' : 'error' });
      return;
    }
    set({
      status: 'ready',
      rows: ((live.data ?? []) as MrrAtRiskDbRow[]).map(mrrFromRow),
      snapshots: ((snaps.data ?? []) as MrrSnapshotDbRow[]).map(snapshotFromRow),
    });
  },
}));

export interface OwnerRetention {
  status: 'loading' | 'ready' | 'error';
  live: boolean;
  atRisk: MrrAtRiskRow[];
  trend: MrrTrend[];
  kept: MrrKeptRow[];
  year: number;
  reload(): void;
}

/** Call only from owner-gated UI. */
export function useOwnerRetention(): OwnerRetention {
  const demo = isDemo();
  const today = localToday();
  const year = Number(today.slice(0, 4));
  const coachOf = useTeam((s) => s.coachOf);
  const liveState = useLiveMrr();
  const retention = useRetention();

  useEffect(() => {
    if (!demo && liveState.status === 'idle') void liveState.load();
    if (retention.status === 'idle') void retention.load();
  }, [demo, liveState, retention]);

  const activity = useMemo(() => (demo ? demoMemberActivity(undefined, coachOf) : []), [demo, coachOf]);
  const { ready, physio } = usePhysiologyMap(activity.map((a) => a.clientId));
  const currency = DEMO_PLANS[0]?.currency ?? 'usd';

  const atRisk = useMemo(() => {
    if (!demo) return liveState.rows;
    const roster = ownerRoster(
      activity.map((a) => ({ ...a, currency })),
      physio,
      today,
    );
    return mrrAtRisk(roster.map((m) => ({ monthlyCents: m.monthlyCents, level: m.risk.level, currency: m.currency ?? currency })));
  }, [demo, liveState.rows, activity, physio, today, currency]);

  const trend = useMemo(
    () => mrrAtRiskTrend(demo ? demoMrrSnapshots() : liveState.snapshots, today, { current: atRisk }),
    [demo, liveState.snapshots, today, atRisk],
  );
  const kept = useMemo(
    () => mrrKept(retention.interventions, retention.memberStatus, today, { year, currency: retention.currency }),
    [retention.interventions, retention.memberStatus, retention.currency, today, year],
  );

  const status: OwnerRetention['status'] = demo
    ? ready && retention.status === 'ready'
      ? 'ready'
      : 'loading'
    : liveState.status === 'error'
      ? 'error'
      : liveState.status === 'ready'
        ? 'ready'
        : 'loading';

  return {
    status,
    live: !demo,
    atRisk,
    trend,
    kept,
    year,
    reload: () => {
      if (!demo) void useLiveMrr.getState().load();
      void useRetention.getState().load();
    },
  };
}
