import { create } from 'zustand';
import { demoTriage, DEMO_CLIENTS, type DemoClient } from '@spotter/core/demo';
import type { TriageItem } from '@spotter/core';

/*
 * MOCK DATA — coach-side state for the demo. Real builds subscribe to the
 * triage:<tenant_id>:<coach_id> realtime channel and write to triage_items.
 */
interface CoachState {
  clients: DemoClient[];
  triage: TriageItem[];
  notes: Record<string, string>;
  markHandled(clientId: string): TriageItem[];
  restore(items: TriageItem[]): void;
  snooze(clientId: string, until: Date): void;
  setNote(clientId: string, note: string): void;
  setPaused(clientId: string, paused: boolean): void;
}

export const useCoach = create<CoachState>((set, get) => ({
  clients: DEMO_CLIENTS,
  triage: demoTriage(),
  notes: {},
  markHandled(clientId) {
    const now = new Date().toISOString();
    const handled = get().triage.filter((t) => t.clientId === clientId && !t.handledAt);
    set({ triage: get().triage.map((t) => (t.clientId === clientId && !t.handledAt ? { ...t, handledAt: now } : t)) });
    return handled;
  },
  restore(items) {
    const ids = new Set(items.map((i) => i.id));
    set({ triage: get().triage.map((t) => (ids.has(t.id) ? { ...t, handledAt: null } : t)) });
  },
  snooze(clientId, until) {
    set({ triage: get().triage.map((t) => (t.clientId === clientId && !t.handledAt ? { ...t, snoozedUntil: until.toISOString() } : t)) });
  },
  setNote: (clientId, note) => set({ notes: { ...get().notes, [clientId]: note } }),
  setPaused: (clientId, paused) =>
    set({ clients: get().clients.map((c) => (c.id === clientId ? { ...c, status: paused ? 'paused' : 'active' } : c)) }),
}));

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
