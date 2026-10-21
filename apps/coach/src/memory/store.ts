import { useEffect } from 'react';
import { create } from 'zustand';
import { uuidv7, type TriageItem } from '@spotter/core';
import { DEMO_CLIENTS, isoDay } from '@spotter/core/demo';
import { readShared, writeShared } from '@spotter/ui';
import { getAuth, isConfigured, supabase } from '@spotter/ui/platform';
import { tenant } from '../env';
import { useCoach } from '../store';
import { useInbox } from '../platform/inbox';

/*
 * Coach memory (docs/features/coach-memory.md): follow-ups ("remind me") and dated private notes.
 * Connected builds read and write follow_ups / coach_notes under RLS (the writer and the owner only,
 * never the client). The demo keeps them in localStorage under spotter.memory.<tenant>.
 */

export interface FollowUp {
  id: string;
  clientId: string;
  text: string;
  /** YYYY-MM-DD */
  dueOn: string;
  doneAt: string | null;
  createdAt: string;
}

export interface CoachNote {
  id: string;
  clientId: string;
  text: string;
  at: string;
}

interface MemoryState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  followUps: FollowUp[];
  notes: CoachNote[];
  load(): Promise<void>;
  addFollowUp(clientId: string, text: string, dueOn: string): Promise<FollowUp>;
  setFollowUpDone(id: string, done: boolean): Promise<void>;
  addNote(clientId: string, text: string): Promise<void>;
}

const KEY = `spotter.memory.${tenant.slug}`;
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

/* MOCK: Jordan's follow-up and notes so memory and the prep card have something real to say. */
function demoSeed(): { followUps: FollowUp[]; notes: CoachNote[] } {
  const jordan = DEMO_CLIENTS[0]!.id;
  return {
    followUps: [
      {
        id: 'demo-fu-1',
        clientId: jordan,
        text: 'How the new job’s hours are going',
        dueOn: isoDay(0),
        doneAt: null,
        createdAt: daysAgo(6),
      },
    ],
    notes: [
      {
        id: 'demo-note-1',
        clientId: jordan,
        text: 'Started a new job on 12 Oct. Evenings only for now.',
        at: daysAgo(9),
      },
      {
        id: 'demo-note-2',
        clientId: jordan,
        text: 'Wants a 100 kg squat by the end of the year.',
        at: daysAgo(30),
      },
    ],
  };
}

/* MOCK: the question behind Jordan's "unread message" in the demo triage. */
function seedDemoThread() {
  const jordan = DEMO_CLIENTS[0]!.id;
  const threads = useInbox.getState().threads;
  if (threads[jordan]?.length) return;
  useInbox.setState({
    threads: {
      ...threads,
      [jordan]: [
        {
          id: 'demo-msg-1',
          mine: true,
          kind: 'text',
          body: 'Nice work on Lower A. Same weights next time, and log how the last set feels.',
          mediaUri: null,
          durationMs: null,
          sentAt: daysAgo(6.8),
          readAt: daysAgo(6.7),
        },
        {
          id: 'demo-msg-2',
          mine: false,
          kind: 'text',
          body: 'Squats felt heavy on the last set. Is that normal?',
          mediaUri: null,
          durationMs: null,
          sentAt: daysAgo(0.1),
          readAt: null,
        },
      ],
    },
  });
}

type FollowUpRow = {
  id: string;
  client_id: string;
  text: string;
  due_on: string;
  done_at: string | null;
  created_at: string;
};
type NoteRow = { id: string; client_id: string; body: string; created_at: string };

export const useMemory = create<MemoryState>((set, get) => {
  const persist = () =>
    isConfigured()
      ? Promise.resolve()
      : writeShared(KEY, { followUps: get().followUps, notes: get().notes });
  return {
    status: 'idle',
    followUps: [],
    notes: [],

    async load() {
      if (get().status === 'loading') return;
      set({ status: 'loading' });
      try {
        if (isConfigured() && supabase) {
          if (getAuth().status !== 'signedIn') return set({ status: 'ready' });
          const [f, n] = await Promise.all([
            supabase
              .from('follow_ups')
              .select('id, client_id, text, due_on, done_at, created_at')
              .eq('tenant_id', tenant.id)
              .eq('coach_id', getAuth().userId),
            supabase
              .from('coach_notes')
              .select('id, client_id, body, created_at')
              .eq('tenant_id', tenant.id)
              .eq('coach_id', getAuth().userId)
              .order('created_at', { ascending: false })
              .limit(500),
          ]);
          if (f.error || n.error) throw new Error('load');
          set({
            status: 'ready',
            followUps: (f.data as FollowUpRow[]).map((r) => ({
              id: r.id,
              clientId: r.client_id,
              text: r.text,
              dueOn: r.due_on,
              doneAt: r.done_at,
              createdAt: r.created_at,
            })),
            notes: (n.data as NoteRow[]).map((r) => ({
              id: r.id,
              clientId: r.client_id,
              text: r.body,
              at: r.created_at,
            })),
          });
          return;
        }
        const saved = await readShared<{ followUps: FollowUp[]; notes: CoachNote[] } | null>(
          KEY,
          null,
        );
        set({ status: 'ready', ...(saved ?? demoSeed()) });
        seedDemoThread();
      } catch {
        set({ status: 'error' });
      }
    },

    async addFollowUp(clientId, text, dueOn) {
      const f: FollowUp = {
        id: uuidv7(),
        clientId,
        text: text.trim(),
        dueOn,
        doneAt: null,
        createdAt: new Date().toISOString(),
      };
      set({ followUps: [...get().followUps, f] });
      if (isConfigured() && supabase) {
        const { error } = await supabase.from('follow_ups').insert({
          id: f.id,
          tenant_id: tenant.id,
          coach_id: getAuth().userId,
          client_id: clientId,
          text: f.text,
          due_on: dueOn,
        });
        if (error) {
          set({ followUps: get().followUps.filter((x) => x.id !== f.id) });
          throw new Error('Couldn’t save the reminder. Check your connection and try again.');
        }
      } else await persist();
      return f;
    },

    async setFollowUpDone(id, done) {
      const doneAt = done ? new Date().toISOString() : null;
      if (get().followUps.find((f) => f.id === id)?.doneAt == null && !done) return;
      set({ followUps: get().followUps.map((f) => (f.id === id ? { ...f, doneAt } : f)) });
      if (isConfigured() && supabase)
        await supabase.from('follow_ups').update({ done_at: doneAt }).eq('id', id);
      else await persist();
    },

    async addNote(clientId, text) {
      const note: CoachNote = {
        id: uuidv7(),
        clientId,
        text: text.trim(),
        at: new Date().toISOString(),
      };
      set({ notes: [note, ...get().notes] });
      if (isConfigured() && supabase) {
        const { error } = await supabase.from('coach_notes').insert({
          id: note.id,
          tenant_id: tenant.id,
          coach_id: getAuth().userId,
          client_id: clientId,
          body: note.text,
        });
        if (error) {
          set({ notes: get().notes.filter((x) => x.id !== note.id) });
          throw new Error('Couldn’t save the note. Check your connection and try again.');
        }
      } else await persist();
    },
  };
});

/** Loads memory once (and, in the demo, the sample thread behind Jordan's unread message). */
export function useMemoryLoaded() {
  const status = useMemory((s) => s.status);
  const load = useMemory((s) => s.load);
  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);
}

/** Demo triage id for a follow-up; connected builds get DB ids and the server trigger does the rest. */
export const followUpTriageId = (followUpId: string) => `fu-${followUpId}`;

// Marking a "Follow-up" triage row handled completes the follow-up; Undo reopens it (demo only:
// connected builds do this with the follow_up_handled trigger).
let lastTriage: TriageItem[] = useCoach.getState().triage;
useCoach.subscribe((s) => {
  if (s.triage === lastTriage) return;
  const before = new Map(lastTriage.map((t) => [t.id, t]));
  lastTriage = s.triage;
  if (isConfigured()) return;
  for (const t of s.triage) {
    if (t.reason !== 'follow_up_due' || !t.id.startsWith('fu-')) continue;
    const was = before.get(t.id);
    if (was && !!was.handledAt !== !!t.handledAt)
      void useMemory.getState().setFollowUpDone(t.id.slice(3), !!t.handledAt);
  }
});
