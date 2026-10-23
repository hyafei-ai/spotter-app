import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { uuidv7, type MobilityKind, type MobilitySession } from '@spotter/core';
import { kv } from '../storage';
import { syncQueue } from '../sync';
import { tenant } from '../env';
import { localDate } from '../nutrition/store';

/**
 * "Did mobility" logs (docs/ux/mobility-capture.md). Offline first: saved on the phone and queued as
 * mobility.log / mobility.delete. Mobility is training data, so the coach sees it like sessions.
 */

export type MobilityEntry = MobilitySession & { loggedAt: string };

/** Stable empty for selectors. */
export const NO_MOBILITY: MobilityEntry[] = [];

interface MobilityState {
  hydrated: boolean;
  logs: MobilityEntry[];
  log(input: { minutes: number; kind: MobilityKind; routineId?: string | null }, date?: string): Promise<MobilityEntry>;
  remove(id: string): Promise<void>;
}

export const useMobility = create<MobilityState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      logs: NO_MOBILITY,

      async log(input, date = localDate()) {
        const entry: MobilityEntry = {
          id: uuidv7(),
          date,
          minutes: Math.max(1, Math.min(240, Math.round(input.minutes))),
          kind: input.kind,
          source: 'spotter',
          routineId: input.routineId ?? null,
          loggedAt: new Date().toISOString(),
        };
        set({ logs: [...get().logs, entry].sort((a, b) => a.date.localeCompare(b.date)) });
        await syncQueue.enqueue('mobility.log', {
          mobilityId: entry.id,
          date: entry.date,
          minutes: entry.minutes,
          kind: entry.kind,
          routineId: entry.routineId,
          loggedAt: entry.loggedAt,
        });
        void syncQueue.flush();
        return entry;
      },

      async remove(id) {
        const logs = get().logs.filter((l) => l.id !== id);
        set({ logs: logs.length ? logs : NO_MOBILITY });
        await syncQueue.enqueue('mobility.delete', { mobilityId: id, deletedAt: new Date().toISOString() });
        void syncQueue.flush();
      },
    }),
    {
      name: `spotter.mobility.${tenant.slug}`,
      storage: createJSONStorage(() => kv),
      partialize: ({ logs }) => ({ logs }),
      onRehydrateStorage: () => () => useMobility.setState({ hydrated: true }),
    },
  ),
);
