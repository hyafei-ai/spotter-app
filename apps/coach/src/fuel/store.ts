import { useEffect, useState } from 'react';
import type { TriageItem } from '@spotter/core';
import { EMPTY_FUEL_SHARES, fuelKey, type FuelShareEntry, type FuelSharesDoc } from '@spotter/core/demo';
import { isConfigured } from '@spotter/ui/platform';
import { onSharedChange, readShared } from '@spotter/ui';
import { tenant } from '../env';
import { useCoach } from '../store';

/*
 * The fuel check level a client chose to share (docs/features/fuel.md): the level and the signs' text,
 * nothing else. Real builds read fuel_shares (RLS: only while the client shares). MOCK: the demo client
 * app writes the same projection to `spotter.fuel.<tenant>`. Private by default, so before the client
 * turns sharing on there's nothing here.
 */

export function useFuelShares(): { loaded: boolean; doc: FuelSharesDoc } {
  const [state, setState] = useState<{ loaded: boolean; doc: FuelSharesDoc }>({ loaded: false, doc: EMPTY_FUEL_SHARES });
  useEffect(() => {
    let live = true;
    const load = () => void readShared<FuelSharesDoc>(fuelKey(tenant.slug), EMPTY_FUEL_SHARES).then((doc) => live && setState({ loaded: true, doc }));
    load();
    const off = onSharedChange((key) => key === fuelKey(tenant.slug) && load());
    return () => {
      live = false;
      off();
    };
  }, []);
  return state;
}

export function useFuelShare(clientId: string): { loaded: boolean; share: FuelShareEntry | null } {
  const { loaded, doc } = useFuelShares();
  return { loaded, share: doc[clientId] ?? null };
}

/**
 * Demo stand-in for the server's fuel_shares trigger: a shared "worth talking to someone" level opens a
 * "Fuel check flagged" item in Clients, once per open item. Connected builds get it from triage_items.
 */
export function useFuelTriage() {
  const { doc } = useFuelShares();
  useEffect(() => {
    if (isConfigured()) return;
    const triage = useCoach.getState().triage;
    const add: TriageItem[] = [];
    for (const [clientId, share] of Object.entries(doc)) {
      if (share?.level !== 'talk_to_someone') continue;
      const id = `fuel-${clientId}-${share.date}`;
      const open = triage.some((t) => t.clientId === clientId && t.reason === 'fuel_pattern' && (!t.handledAt || t.id === id));
      if (!open) add.push({ id, clientId, reason: 'fuel_pattern', since: share.sharedAt, snoozedUntil: null, handledAt: null });
    }
    if (add.length) useCoach.setState((s) => ({ triage: [...s.triage, ...add] }));
  }, [doc]);
}
