import { useEffect, useState } from 'react';
import { uuidv7 } from '@spotter/core';
import { getAuth, isConfigured, supabase, type RealtimeMessageRow } from '@spotter/ui/platform';
import { kv } from '../storage';
import { syncQueue } from '../sync';
import { useApp, type ChatMessage } from '../store';
import { currentThreadId, usePulled } from './pulled';

/*
 * Thread extras for C-6: voice notes, photos and workout links, read receipts and live updates.
 * Media goes to the private message-media bucket. The message itself is queued offline like any
 * other write; the file upload retries separately until it succeeds.
 */

interface PendingUpload {
  path: string;
  uri: string;
  contentType: string;
}
const UPLOADS_KEY = 'spotter.pendingUploads';

async function pending(): Promise<PendingUpload[]> {
  const raw = await kv.getItem(UPLOADS_KEY);
  return raw ? (JSON.parse(raw) as PendingUpload[]) : [];
}

/** Retries media uploads that haven't reached the server yet. Called on start, reconnect and foreground. */
export async function flushUploads(): Promise<void> {
  if (!supabase || getAuth().status !== 'signedIn') return;
  const left: PendingUpload[] = [];
  for (const u of await pending()) {
    try {
      const body = await (await fetch(u.uri)).blob();
      const { error } = await supabase.storage.from('message-media').upload(u.path, body, { contentType: u.contentType, upsert: true });
      if (error) left.push(u);
    } catch {
      left.push(u);
    }
  }
  await kv.setItem(UPLOADS_KEY, JSON.stringify(left));
}

export async function sendAttachment(a: {
  kind: 'voice' | 'image' | 'link';
  uri?: string;
  durationMs?: number;
  link?: ChatMessage['link'];
  body?: string;
}): Promise<void> {
  const id = uuidv7();
  const threadId = currentThreadId();
  const sentAt = new Date().toISOString();
  const tenantId = usePulled.getState().tenantId;
  const ext = a.kind === 'voice' ? 'm4a' : 'jpg';
  const mediaPath = a.uri && isConfigured() && tenantId ? `${tenantId}/${threadId}/${id}.${ext}` : null;
  if (mediaPath && a.uri) {
    const list = await pending();
    list.push({ path: mediaPath, uri: a.uri, contentType: a.kind === 'voice' ? 'audio/mp4' : 'image/jpeg' });
    await kv.setItem(UPLOADS_KEY, JSON.stringify(list));
    void flushUploads();
  }
  const m = await syncQueue.enqueue('message.attach', {
    messageId: id,
    threadId,
    kind: a.kind,
    body: a.body ?? null,
    mediaPath,
    durationMs: a.durationMs ?? null,
    link: a.link ?? null,
    sentAt,
  });
  useApp.setState({
    messages: [
      ...useApp.getState().messages,
      {
        id,
        from: 'client',
        body: a.body ?? '',
        sentAt,
        mutationId: m.clientMutationId,
        kind: a.kind,
        mediaUri: a.uri ?? null,
        durationMs: a.durationMs ?? null,
        link: a.link ?? null,
      },
    ],
  });
  void syncQueue.flush();
}

/** Read receipts: tells the server the client has seen the coach's messages up to now. */
export async function markThreadRead(): Promise<void> {
  const msgs = useApp.getState().messages;
  const lastCoach = [...msgs].reverse().find((m) => m.from === 'coach');
  if (!lastCoach || lastCoach.readAt) return;
  const now = new Date().toISOString();
  useApp.setState({ messages: msgs.map((m) => (m.from === 'coach' && !m.readAt ? { ...m, readAt: now } : m)) });
  if (isConfigured()) await syncQueue.enqueue('message.read', { threadId: currentThreadId(), upTo: now });
}

/** Folds a realtime row (new message or read receipt) into the local thread. */
export function applyRealtimeRow(row: RealtimeMessageRow): void {
  const uid = getAuth().userId;
  const msgs = useApp.getState().messages;
  const existing = msgs.find((m) => m.id === row.id);
  const next: ChatMessage = {
    id: row.id,
    from: row.sender_id === uid ? 'client' : 'coach',
    body: row.body ?? '',
    sentAt: row.sent_at,
    mutationId: existing?.mutationId ?? null,
    kind: row.kind === 'video' ? 'link' : row.kind,
    mediaUri: existing?.mediaUri ?? null,
    durationMs: row.duration_ms,
    link: row.link as ChatMessage['link'],
    readAt: row.read_at,
  };
  useApp.setState({
    messages: existing ? msgs.map((m) => (m.id === row.id ? next : m)) : [...msgs, next].sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
  });
}

/** Signed URL (1 h) for a media file stored on the server; null until it's available. */
export function useMediaUrl(localUri: string | null | undefined, messageId: string, kind: string): string | null {
  const [url, setUrl] = useState<string | null>(localUri ?? null);
  useEffect(() => {
    if (localUri || !supabase) return;
    const tenantId = usePulled.getState().tenantId;
    if (!tenantId) return;
    const path = `${tenantId}/${currentThreadId()}/${messageId}.${kind === 'voice' ? 'm4a' : 'jpg'}`;
    void supabase.storage
      .from('message-media')
      .createSignedUrl(path, 3600)
      .then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [localUri, messageId, kind]);
  return url;
}
