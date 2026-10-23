import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import {
  DEFAULT_LIGHTER,
  LighterRule,
  dayFor,
  describeLighter,
  type ClientDay,
  type Pattern,
  type MastersWin,
  type PlannedDay,
} from '@spotter/core';
import {
  SAMPLE_CLIENT,
  demoPlannedToday,
  demoRosterDays,
  demoRosterPatterns,
  demoRosterWins,
  isSampleClient,
  isoDay,
  lighterKey,
  type DemoClient,
  type LighterRules,
} from '@spotter/core/demo';
import { readShared } from '@spotter/ui';
import { isConfigured, supabase } from '@spotter/ui/platform';
import { tenant } from '../env';
import { useCoach } from '../store';
import { activeAssignmentFor, usePrograms } from '../programs';
import { useTeam, useVisibleClientIds } from '../platform/team';
import { requestedClientIds } from '../retention/store';

/*
 * Data for the coach's Today, the client page's "What works" and timeline, and the all-clients grid
 * (docs/ux/coach-experience.md). One place decides where a client's daily history comes from:
 * - Demo: MOCK histories from @spotter/core/demo (demoRosterDays), computed once per client per day.
 * - Connected: TODO-INTEGRATE a `client_days_for_coach(client, from, to)` RPC that returns the shared
 *   ClientDay rows (health fields only when the client shares them with this coach). Until then a
 *   connected client has no history here and the screens show their "nothing synced yet" states.
 * The sample client (first login) always uses MOCK data and is always labelled.
 */

const isDemo = () => !isConfigured() || !supabase;

/* ---------- first login ---------- */

const FIRST_RUN_KEY = 'spotter.coach.firstRunPreview';
function readFirstRun(): boolean {
  try {
    return globalThis.localStorage?.getItem(FIRST_RUN_KEY) === '1';
  } catch {
    return false;
  }
}

interface FirstRunState {
  /** Demo only: show the app as a coach on their first login (no clients yet, the sample client only). */
  preview: boolean;
  setPreview(on: boolean): void;
}

export const useFirstRunPreview = create<FirstRunState>((set) => ({
  preview: readFirstRun(),
  setPreview(on) {
    try {
      globalThis.localStorage?.setItem(FIRST_RUN_KEY, on ? '1' : '0');
    } catch {
      // private mode: the toggle still works for this visit
    }
    set({ preview: on });
  },
}));

/**
 * The clients this viewer sees, and whether this is the first-run state (no real clients: the sample client
 * stands in). Assistants see their assigned clients plus any they were asked to check in with.
 */
export function useRoster(): { clients: DemoClient[]; firstRun: boolean } {
  const all = useCoach((s) => s.clients);
  const triage = useCoach((s) => s.triage);
  const preview = useFirstRunPreview((s) => s.preview);
  const base = useVisibleClientIds();
  const viewerId = useTeam((s) => s.viewerId);
  return useMemo(() => {
    if (preview || all.length === 0) return { clients: [SAMPLE_CLIENT], firstRun: true };
    const visible = base ? new Set([...base, ...requestedClientIds(triage, viewerId)]) : null;
    return { clients: visible ? all.filter((c) => visible.has(c.id)) : all, firstRun: false };
  }, [all, preview, base, triage, viewerId]);
}

/** A client by id, including the sample client. */
export function useClient(id: string | undefined): DemoClient | undefined {
  const c = useCoach((s) => s.clients.find((x) => x.id === id));
  return id && isSampleClient(id) ? SAMPLE_CLIENT : c;
}

/* ---------- daily history ---------- */

const cache = new Map<string, ClientDay[]>();

/**
 * The client's last `days` days, oldest first. `includeCycle` only when the client shares the cycle with the
 * viewer. Health fields are the caller's to hide when the viewer doesn't see this client's health.
 */
export function clientDays(clientId: string, days = 56, includeCycle = false): ClientDay[] {
  if (!isDemo() && !isSampleClient(clientId)) return [];
  const key = `${isoDay(0)}:${clientId}:${days}:${includeCycle}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = demoRosterDays(clientId, new Date(), { days, includeCycle });
    cache.set(key, hit);
  }
  return hit;
}

export function useClientDays(clientId: string, days = 56, includeCycle = false): ClientDay[] {
  return useMemo(() => clientDays(clientId, days, includeCycle), [clientId, days, includeCycle]);
}

const patternCache = new Map<string, Pattern[]>();
/** "What works" for a client. Demo: MOCK patterns. Connected: TODO-INTEGRATE findPatterns over the RPC's days. */
export function clientPatterns(clientId: string, includeCycle = false): Pattern[] {
  if (!isDemo() && !isSampleClient(clientId)) return [];
  const key = `${isoDay(0)}:${clientId}:${includeCycle}`;
  let hit = patternCache.get(key);
  if (!hit) {
    hit = demoRosterPatterns(clientId, new Date(), { includeCycle });
    patternCache.set(key, hit);
  }
  return hit;
}

const winCache = new Map<string, MastersWin[]>();
/** Wins to mention (masters.ts winsToMention). Demo: MOCK. Connected: TODO-INTEGRATE with the client's sessions. */
export function clientWins(clientId: string): MastersWin[] {
  if (!isDemo() && !isSampleClient(clientId)) return [];
  const key = `${isoDay(0)}:${clientId}`;
  let hit = winCache.get(key);
  if (!hit) {
    hit = demoRosterWins(clientId, new Date());
    winCache.set(key, hit);
  }
  return hit;
}

/* ---------- today's session ---------- */

/** Today's planned session per client: the program store first, then (demo) the MOCK plan. */
export function usePlannedToday(ids: string[]): Record<string, PlannedDay | null> {
  const assignments = usePrograms((s) => s.assignments);
  const key = ids.join(',');
  return useMemo(() => {
    const today = isoDay(0);
    const out: Record<string, PlannedDay | null> = {};
    for (const id of ids) {
      const a = activeAssignmentFor(assignments, id);
      const d = a ? dayFor(a, today) : null;
      out[id] =
        d?.kind === 'session'
          ? d.day
          : d
            ? null
            : isDemo() || isSampleClient(id)
              ? demoPlannedToday(id)
              : null;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, assignments]);
}

/* ---------- the coach's easier-version rules ---------- */

interface LighterState {
  rules: LighterRules | null;
  load(): Promise<void>;
}
const useLighterRules = create<LighterState>((set) => ({
  rules: null,
  async load() {
    set({ rules: await readShared<LighterRules>(lighterKey(tenant.slug), {}) });
  },
}));

/** The easier version in words, per client ("10% lighter loads, 1 fewer set per exercise"). */
export function useLighterWords(): (clientId: string) => string {
  const rules = useLighterRules((s) => s.rules);
  useEffect(() => {
    if (!rules) void useLighterRules.getState().load();
  }, [rules]);
  return (clientId) => {
    const parsed = LighterRule.safeParse(rules?.[clientId]);
    return describeLighter(parsed.success ? parsed.data : DEFAULT_LIGHTER);
  };
}
