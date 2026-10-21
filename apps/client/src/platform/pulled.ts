import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SessionPlan } from '@spotter/core';
import { DEMO_CLIENT } from '@spotter/core/demo';
import { kv } from '../storage';

/**
 * Server data cached for offline use, filled by GET /sync/pull (see pull.ts). Empty in demo builds,
 * where the store's sample data stands in. Kept separate from store.ts so the store can read it
 * without import cycles.
 */
interface PulledState {
  cursor: string | null;
  threadId: string | null;
  tenantId: string | null;
  /** The next unfinished day of the client's assigned program, as a plan for Today. */
  nextPlan: SessionPlan | null;
  hasAssignment: boolean;
  lastPulledAt: string | null;
  set(patch: Partial<Omit<PulledState, 'set'>>): void;
}

export const usePulled = create<PulledState>()(
  persist(
    (set) => ({
      cursor: null,
      threadId: null,
      tenantId: null,
      nextPlan: null,
      hasAssignment: false,
      lastPulledAt: null,
      set: (patch) => set(patch),
    }),
    { name: 'spotter.pulled', storage: createJSONStorage(() => kv), partialize: ({ set: _s, ...rest }) => rest },
  ),
);

/** The client's thread: from the server once pulled, else the demo thread. */
export const currentThreadId = (): string => usePulled.getState().threadId ?? DEMO_CLIENT.threadId;
