import { create } from 'zustand';
import { revenueSplitProblem } from '@spotter/core';
import { DEMO_CLIENTS } from '@spotter/core/demo';
import { isConfigured, supabase } from '@spotter/ui/platform';
import { tenant } from '../env';
import { createInvite } from './invite';

/*
 * Team (K-8): coaches, who coaches which client, revenue splits and handoff history.
 * MOCK DATA: the demo team (the owner plus one fictional assistant) and assignments.
 * Connected builds read memberships and coach_assignments and write through hand_off_client.
 */

export interface Coach {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'assistant';
  /** Share of revenue from this coach's clients paid to the coach (0–1). The owner keeps the rest. */
  split: number;
  status: 'active' | 'invited';
}

export interface AssignmentEntry {
  coachId: string;
  from: string;
  to: string | null;
  note: string | null;
}

const OWNER_ID = '0192f0a4-0000-7000-8000-000000000001';
const ASSISTANT_ID = '0192f0a4-0000-7000-8000-000000000002';

/** Demo "view the app as" choice, kept across reloads of the web preview. */
const VIEWER_KEY = 'spotter.demoViewer';
function readDemoViewer(): string {
  try {
    const v = globalThis.localStorage?.getItem(VIEWER_KEY);
    return v === ASSISTANT_ID && readDemoTeam() ? ASSISTANT_ID : OWNER_ID;
  } catch {
    return OWNER_ID;
  }
}

/** Demo: a solo coach by default (the main case); "With an assistant" shows the optional team features. */
const TEAM_KEY = 'spotter.demoTeam';
export function readDemoTeam(): boolean {
  try {
    return globalThis.localStorage?.getItem(TEAM_KEY) === '1';
  } catch {
    return false;
  }
}
export function setDemoTeam(on: boolean) {
  try {
    globalThis.localStorage?.setItem(TEAM_KEY, on ? '1' : '0');
    if (!on) globalThis.localStorage?.setItem(VIEWER_KEY, OWNER_ID);
  } catch {
    // storage unavailable: nothing to remember
  }
  // The demo stores read the team once at start, so reload to apply.
  (globalThis as { location?: { reload(): void } }).location?.reload();
}
const DEMO_TEAM = readDemoTeam();

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

interface TeamState {
  coaches: Coach[];
  /** clientId → current coachId */
  coachOf: Record<string, string>;
  history: Record<string, AssignmentEntry[]>;
  /** Demo only: whose view the coach app shows. Connected builds use the signed-in coach's role. */
  viewerId: string;
  setViewer(id: string): void;
  inviteCoach(name: string, email: string, split: number): Promise<{ url: string; emailed: boolean }>;
  setSplit(coachId: string, split: number): void;
  handOff(clientId: string, toCoachId: string, note: string | null): Promise<void>;
}

const initialCoachOf: Record<string, string> = Object.fromEntries(
  DEMO_CLIENTS.map((c, i) => [c.id, DEMO_TEAM && i % 3 === 2 ? ASSISTANT_ID : OWNER_ID]),
);

export const useTeam = create<TeamState>((set, get) => ({
  coaches: [
    { id: OWNER_ID, name: tenant.coach.name, email: tenant.supportEmail, role: 'owner', split: 1, status: 'active' },
    ...(DEMO_TEAM ? [{ id: ASSISTANT_ID, name: 'Leo Park', email: 'leo@mayareyes.example', role: 'assistant' as const, split: 0.6, status: 'active' as const }] : []),
  ],
  coachOf: initialCoachOf,
  history: Object.fromEntries(
    Object.entries(initialCoachOf).map(([clientId, coachId]) => [clientId, [{ coachId, from: daysAgo(60), to: null, note: null }]]),
  ),
  viewerId: readDemoViewer(),
  setViewer: (viewerId) => {
    set({ viewerId });
    try {
      globalThis.localStorage?.setItem(VIEWER_KEY, viewerId);
    } catch {
      // storage unavailable: the choice lasts for this session only
    }
  },

  async inviteCoach(name, email, split) {
    const problem = revenueSplitProblem(split);
    if (problem) throw new Error(problem);
    const invite = await createInvite({ email, name, role: 'assistant' });
    const id = `invited-${email.toLowerCase()}`;
    set({ coaches: [...get().coaches.filter((c) => c.id !== id), { id, name, email: email.toLowerCase(), role: 'assistant', split, status: 'invited' }] });
    return invite;
  },

  setSplit(coachId, split) {
    if (revenueSplitProblem(split)) return;
    set({ coaches: get().coaches.map((c) => (c.id === coachId ? { ...c, split } : c)) });
    if (isConfigured() && supabase) {
      void supabase.from('memberships').update({ revenue_split: split }).eq('tenant_id', tenant.id).eq('profile_id', coachId);
    }
  },

  async handOff(clientId, toCoachId, note) {
    if (isConfigured() && supabase) {
      const { error } = await supabase.rpc('hand_off_client', { t: tenant.id, client: clientId, to_coach: toCoachId, note });
      if (error) throw new Error(error.message);
    }
    const now = new Date().toISOString();
    const past = (get().history[clientId] ?? []).map((h) => (h.to ? h : { ...h, to: now }));
    set({
      coachOf: { ...get().coachOf, [clientId]: toCoachId },
      history: { ...get().history, [clientId]: [...past, { coachId: toCoachId, from: now, to: null, note }] },
    });
  },
}));

/** The viewer's role. Assistants don't see billing, branding or publishing (UX finding M1). */
export function useRole(): { viewerId: string; isOwner: boolean; viewer: Coach | undefined } {
  const viewerId = useTeam((s) => s.viewerId);
  const viewer = useTeam((s) => s.coaches.find((c) => c.id === s.viewerId));
  return { viewerId, isOwner: viewer?.role !== 'assistant', viewer };
}

/** Clients the viewer may see: all of them for the owner, only assigned ones for an assistant. */
export function useVisibleClientIds(): Set<string> | null {
  const { viewerId, isOwner } = useRole();
  const coachOf = useTeam((s) => s.coachOf);
  if (isOwner) return null;
  return new Set(Object.entries(coachOf).filter(([, c]) => c === viewerId).map(([id]) => id));
}

export const DEMO_TEAM_IDS = { OWNER_ID, ASSISTANT_ID };
