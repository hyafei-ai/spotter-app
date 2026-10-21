import { create } from 'zustand';
import { uuidv7 } from '@spotter/core';
import { getAuth, isConfigured, supabase } from '@spotter/ui/platform';
import { tenant } from '../env';

/*
 * Coach inbox tools (K-1): per-client threads, saved replies and bulk messages.
 * Connected builds read and write messages/saved_replies under RLS; the demo keeps them in memory.
 */

export interface CoachMessage {
  id: string;
  mine: boolean;
  kind: 'text' | 'voice' | 'image' | 'link';
  body: string;
  mediaUri: string | null;
  durationMs: number | null;
  sentAt: string;
  readAt: string | null;
}

export interface SavedReply {
  id: string;
  title: string;
  body: string;
}

interface InboxState {
  threads: Record<string, CoachMessage[]>;
  savedReplies: SavedReply[];
  send(clientId: string, m: Omit<CoachMessage, 'id' | 'mine' | 'sentAt' | 'readAt'>): Promise<void>;
  sendBulk(clientIds: string[], body: string): Promise<number>;
  saveReply(title: string, body: string): Promise<void>;
  deleteReply(id: string): Promise<void>;
  loadReplies(): Promise<void>;
}

/* MOCK: starter saved replies so the picker isn't empty in the demo. */
const STARTER_REPLIES: SavedReply[] = [
  { id: 'r1', title: 'Good week', body: 'Good week. Same plan next week, and keep logging RPE.' },
  { id: 'r2', title: 'Missed sessions', body: 'Noticed you missed a couple of sessions. Anything getting in the way? We can shorten them.' },
  { id: 'r3', title: 'Form check received', body: 'Got your video. I’ll have notes for you by tomorrow.' },
];

export const useInbox = create<InboxState>((set, get) => ({
  threads: {},
  savedReplies: isConfigured() ? [] : STARTER_REPLIES,

  async send(clientId, m) {
    const msg: CoachMessage = { ...m, id: uuidv7(), mine: true, sentAt: new Date().toISOString(), readAt: null };
    set({ threads: { ...get().threads, [clientId]: [...(get().threads[clientId] ?? []), msg] } });
    if (isConfigured() && supabase) {
      const { data: th } = await supabase.from('threads').select('id').eq('tenant_id', tenant.id).eq('client_id', clientId).single();
      if (!th) throw new Error('This client has no thread yet.');
      let mediaPath: string | null = null;
      if (m.mediaUri) {
        mediaPath = `${tenant.id}/${th.id}/${msg.id}.${m.kind === 'voice' ? 'm4a' : 'jpg'}`;
        const blob = await (await fetch(m.mediaUri)).blob();
        const up = await supabase.storage.from('message-media').upload(mediaPath, blob, { contentType: m.kind === 'voice' ? 'audio/mp4' : 'image/jpeg' });
        if (up.error) throw new Error('Couldn’t upload. Check your connection and try again.');
      }
      const { error } = await supabase.from('messages').insert({
        id: msg.id,
        tenant_id: tenant.id,
        thread_id: th.id,
        sender_id: getAuth().userId,
        kind: m.kind,
        body: m.body || null,
        media_path: mediaPath,
        duration_ms: m.durationMs,
      });
      if (error) throw new Error('Couldn’t send. Check your connection and try again.');
    }
  },

  async sendBulk(clientIds, body) {
    if (isConfigured() && supabase) {
      const { data, error } = await supabase.rpc('send_bulk_message', { t: tenant.id, client_ids: clientIds, body });
      if (error) throw new Error(error.message);
      return data as number;
    }
    const now = new Date().toISOString();
    const threads = { ...get().threads };
    for (const id of clientIds) {
      threads[id] = [...(threads[id] ?? []), { id: uuidv7(), mine: true, kind: 'text', body, mediaUri: null, durationMs: null, sentAt: now, readAt: null }];
    }
    set({ threads });
    return clientIds.length;
  },

  async saveReply(title, body) {
    const reply = { id: uuidv7(), title: title.trim(), body: body.trim() };
    set({ savedReplies: [...get().savedReplies, reply] });
    if (isConfigured() && supabase) {
      await supabase.from('saved_replies').insert({ id: reply.id, tenant_id: tenant.id, coach_id: getAuth().userId, title: reply.title, body: reply.body });
    }
  },

  async deleteReply(id) {
    set({ savedReplies: get().savedReplies.filter((r) => r.id !== id) });
    if (isConfigured() && supabase) await supabase.from('saved_replies').delete().eq('id', id);
  },

  async loadReplies() {
    if (!isConfigured() || !supabase) return;
    const { data } = await supabase.from('saved_replies').select('id, title, body').eq('tenant_id', tenant.id).order('created_at');
    if (data) set({ savedReplies: data as SavedReply[] });
  },
}));
