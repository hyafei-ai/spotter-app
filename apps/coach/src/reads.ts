import { useEffect, useState } from 'react';
import { DEFAULT_LIGHTER, LighterRule, dailyRead, sharedRead } from '@spotter/core';
import {
  DEMO_CLIENT,
  EMPTY_SHARED_READS,
  coachClientIdFor,
  demoDailyChecks,
  lighterKey,
  readsKey,
  type LighterRules,
  type SharedReadEntry,
  type SharedReadsDoc,
} from '@spotter/core/demo';
import { onSharedChange, readShared, writeShared } from '@spotter/ui';
import { tenant } from './env';

/*
 * The client's shared daily reads (client JTBD: share the read without extra effort).
 * Real builds call the shared_reads_for_coach(client) RPC, which returns only what the client shared.
 * MOCK: the demo client app writes the same projection to `spotter.reads.<tenant>`.
 */

/** MOCK: before the client app has been opened, show the reads its sample checks would have shared. */
function seeded(clientId: string): SharedReadEntry[] {
  if (clientId !== coachClientIdFor(DEMO_CLIENT.id)) return [];
  const checks = demoDailyChecks();
  return checks.map((c, i) => {
    const read = dailyRead({ today: c.date, check: c, history: checks.slice(0, i + 1), load: { status: 'unknown', acute: 0, chronicWeekly: 0, ratio: null }, fuel: 'unknown' });
    const shared = sharedRead(read, c);
    return { date: c.date, submittedAt: c.submittedAt, shared: !!shared, read: shared };
  });
}

export interface ClientReads {
  loaded: boolean;
  /** Oldest first. */
  entries: SharedReadEntry[];
  variants: SharedReadsDoc['variants'][string];
}

export function useSharedReads(clientId: string): ClientReads {
  const [state, setState] = useState<ClientReads>({ loaded: false, entries: [], variants: [] });
  useEffect(() => {
    let live = true;
    const load = () =>
      void readShared<SharedReadsDoc>(readsKey(tenant.slug), EMPTY_SHARED_READS).then((doc) => {
        if (!live) return;
        const entries = doc.reads?.[clientId] ?? seeded(clientId);
        setState({ loaded: true, entries, variants: doc.variants?.[clientId] ?? [] });
      });
    load();
    const off = onSharedChange((key) => key === readsKey(tenant.slug) && load());
    return () => {
      live = false;
      off();
    };
  }, [clientId]);
  return state;
}

/** The coach's "easier version" rule for a client. */
export function useLighterRule(clientId: string): [LighterRule, (r: LighterRule) => Promise<void>] {
  const [rule, setRule] = useState<LighterRule>(DEFAULT_LIGHTER);
  useEffect(() => {
    let live = true;
    void readShared<LighterRules>(lighterKey(tenant.slug), {}).then((rules) => {
      const parsed = LighterRule.safeParse(rules[clientId]);
      if (live) setRule(parsed.success ? parsed.data : DEFAULT_LIGHTER);
    });
    return () => {
      live = false;
    };
  }, [clientId]);
  const save = async (r: LighterRule) => {
    setRule(r);
    const rules = await readShared<LighterRules>(lighterKey(tenant.slug), {});
    await writeShared(lighterKey(tenant.slug), { ...rules, [clientId]: r });
  };
  return [rule, save];
}
