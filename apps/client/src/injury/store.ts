import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { uuidv7, type PainLog, type RegionLoad } from '@spotter/core';
import { DEMO_CLIENT, EMPTY_SHARED_PAIN, coachClientIdFor, demoPainLogs, painKey, type SharedPainDoc } from '@spotter/core/demo';
import { readShared, writeShared } from '@spotter/ui';
import { kv } from '../storage';
import { syncQueue } from '../sync';
import { IS_DEMO, tenant } from '../env';
import { localDate } from '../nutrition/store';

/**
 * Pain logs ("Something hurting?" in the daily check; Me → Pain & injuries). Offline first: saved on the
 * phone and queued as pain.log / pain.delete. Shared with the coach by default (they need it for
 * programming); the athlete can turn sharing off per log.
 */

export type PainEntry = PainLog & { shareWithCoach: boolean; loggedAt: string };
export type PainInput = Omit<PainEntry, 'id' | 'date' | 'loggedAt'>;

/** Stable empty for selectors. */
export const NO_PAIN: PainEntry[] = [];

interface InjuryState {
  hydrated: boolean;
  logs: PainEntry[];
  /** Who sees what: whether new pain logs start shared with the coach (on by default). */
  shareDefault: boolean;
  /** Who sees what: sets the default and applies it to every existing log. */
  setShareAll(on: boolean): Promise<void>;
  log(input: PainInput, date?: string): Promise<PainEntry>;
  update(id: string, patch: Partial<PainInput>): Promise<void>;
  remove(id: string): Promise<void>;
  /** MOCK (demo): publish this week's region load for the demo coach app. */
  publishRegions(regions: RegionLoad[]): Promise<void>;
}

const myCoachSideId = () => coachClientIdFor(DEMO_CLIENT.id);

async function enqueue(e: PainEntry) {
  await syncQueue.enqueue('pain.log', {
    painId: e.id,
    date: e.date,
    region: e.region,
    side: e.side,
    level: e.level,
    note: e.note,
    shareWithCoach: e.shareWithCoach,
    loggedAt: e.loggedAt,
  });
  void syncQueue.flush();
}

/** MOCK: the coach-visible projection for the demo coach app. Private logs are never written. */
async function publish(logs: PainEntry[]) {
  const doc = await readShared<SharedPainDoc>(painKey(tenant.slug), EMPTY_SHARED_PAIN);
  const shared: PainLog[] = logs.filter((l) => l.shareWithCoach).map(({ id, date, region, side, level, note }) => ({ id, date, region, side, level, note }));
  await writeShared(painKey(tenant.slug), { ...doc, pain: { ...doc.pain, [myCoachSideId()]: shared.slice(-30) } });
}

export const useInjury = create<InjuryState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      // MOCK: the demo starts with the same knee niggle the fuel check's sample data has, so every screen agrees.
      logs: IS_DEMO ? demoPainLogs().map((l) => ({ ...l, shareWithCoach: true, loggedAt: `${l.date}T18:00:00.000Z` })) : NO_PAIN,
      shareDefault: true,

      async setShareAll(on) {
        const stamp = new Date().toISOString();
        const changed = get().logs.filter((l) => l.shareWithCoach !== on).map((l) => ({ ...l, shareWithCoach: on, loggedAt: stamp }));
        const byId = new Map(changed.map((l) => [l.id, l]));
        const logs = get().logs.map((l) => byId.get(l.id) ?? l);
        set({ shareDefault: on, logs: logs.length ? logs : NO_PAIN });
        for (const l of changed) await enqueue(l);
        if (IS_DEMO) await publish(logs);
      },

      async log(input, date = localDate()) {
        const entry: PainEntry = { ...input, id: uuidv7(), date, loggedAt: new Date().toISOString() };
        const logs = [...get().logs, entry].sort((a, b) => a.date.localeCompare(b.date));
        set({ logs });
        await enqueue(entry);
        if (IS_DEMO) await publish(logs);
        return entry;
      },

      async update(id, patch) {
        const cur = get().logs.find((l) => l.id === id);
        if (!cur) return;
        const next: PainEntry = { ...cur, ...patch, loggedAt: new Date().toISOString() };
        const logs = get().logs.map((l) => (l.id === id ? next : l));
        set({ logs });
        await enqueue(next);
        if (IS_DEMO) await publish(logs);
      },

      async remove(id) {
        const logs = get().logs.filter((l) => l.id !== id);
        set({ logs: logs.length ? logs : NO_PAIN });
        await syncQueue.enqueue('pain.delete', { painId: id, deletedAt: new Date().toISOString() });
        void syncQueue.flush();
        if (IS_DEMO) await publish(logs);
      },

      async publishRegions(regions) {
        if (!IS_DEMO) return;
        const doc = await readShared<SharedPainDoc>(painKey(tenant.slug), EMPTY_SHARED_PAIN);
        await writeShared(painKey(tenant.slug), { ...doc, regions: { ...doc.regions, [myCoachSideId()]: { date: localDate(), regions } } });
      },
    }),
    {
      name: `spotter.injury.${tenant.slug}`,
      storage: createJSONStorage(() => kv),
      partialize: ({ logs, shareDefault }) => ({ logs, shareDefault }),
      onRehydrateStorage: () => () => useInjury.setState({ hydrated: true }),
    },
  ),
);
