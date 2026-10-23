import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { WatchSessionPlan, WatchSessionSummary } from '@spotter/core';
import { DEMO_CLIENT, EMPTY_SHARED_WATCH, coachClientIdFor, watchKey, type SharedWatchDoc } from '@spotter/core/demo';
import { readShared, writeShared } from '@spotter/ui';
import { kv } from '../storage';
import { syncQueue } from '../sync';
import { IS_DEMO, tenant } from '../env';

/**
 * Phone-side watch state: the client's heart-rate sharing switch, the plans last sent to the watch (a result
 * names its plan by id, so the phone keeps them to map the result back), and what came back.
 */
interface WatchState {
  /** Who sees what: "Heart rate from watch sessions". On by default, like sessions (training data). */
  shareHr: boolean;
  setShareHr(on: boolean): Promise<void>;
  /** planId → plan, for the last few days of contexts. */
  plans: Record<string, WatchSessionPlan>;
  rememberPlans(plans: WatchSessionPlan[]): void;
  /** Result ids already stored: the same result delivered twice is stored once. */
  seen: string[];
  markSeen(id: string): void;
  /** The latest watch sessions' summaries (newest last), for Me → Apple Watch and the preview. */
  summaries: (WatchSessionSummary & { title: string; date: string })[];
  addSummary(s: WatchSessionSummary & { title: string; date: string }): void;
  lastContextAt: string | null;
  setLastContextAt(at: string): void;
}

export const useWatch = create<WatchState>()(
  persist(
    (set, get) => ({
      shareHr: true,
      async setShareHr(on) {
        set({ shareHr: on });
        await syncQueue.enqueue('watch.share.set', { shareWithCoach: on, updatedAt: new Date().toISOString() });
        void syncQueue.flush();
        // MOCK (demo): the coach app hides this client's watch summaries while the switch is off.
        if (IS_DEMO) {
          const doc = await readShared<SharedWatchDoc>(watchKey(tenant.slug), EMPTY_SHARED_WATCH);
          await writeShared(watchKey(tenant.slug), { ...doc, hidden: { ...doc.hidden, [coachClientIdFor(DEMO_CLIENT.id)]: !on } });
        }
      },
      plans: {},
      rememberPlans(plans) {
        const next = { ...get().plans };
        for (const p of plans) next[p.planId] = p;
        // Keep the last 30 plans (about ten days of three versions).
        const keep = Object.values(next)
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-30);
        set({ plans: Object.fromEntries(keep.map((p) => [p.planId, p])) });
      },
      seen: [],
      markSeen: (id) => set({ seen: [...get().seen, id].slice(-200) }),
      summaries: [],
      addSummary(s) {
        set({ summaries: [...get().summaries.filter((x) => x.sessionId !== s.sessionId), s].slice(-20), seen: [...get().seen, s.sessionId].slice(-200) });
      },
      lastContextAt: null,
      setLastContextAt: (at) => set({ lastContextAt: at }),
    }),
    { name: 'spotter.watch', storage: createJSONStorage(() => kv) },
  ),
);
