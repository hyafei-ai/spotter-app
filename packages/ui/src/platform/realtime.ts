import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface RealtimeMessageRow {
  id: string;
  thread_id: string;
  sender_id: string;
  kind: 'text' | 'voice' | 'image' | 'video' | 'link';
  body: string | null;
  media_path: string | null;
  duration_ms: number | null;
  link: { type: string; id: string; title: string } | null;
  sent_at: string;
  read_at: string | null;
}

/**
 * thread:<id> (C-6): new and updated messages (read receipts) via Postgres changes, and a
 * "typing" broadcast. Typing state clears itself 4 s after the last keystroke event.
 * Does nothing in demo builds.
 */
export function useThreadRealtime(
  threadId: string | null,
  selfId: string | null,
  onMessage: (row: RealtimeMessageRow, event: 'INSERT' | 'UPDATE') => void,
): { otherTyping: boolean; sendTyping: () => void; live: boolean } {
  const [otherTyping, setOtherTyping] = useState(false);
  const [live, setLive] = useState(false);
  const channel = useRef<RealtimeChannel | null>(null);
  const lastSent = useRef(0);
  const handler = useRef(onMessage);
  useEffect(() => {
    handler.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!supabase || !threadId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase
      .channel(`thread:${threadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` }, (p) => {
        if (p.eventType === 'INSERT' || p.eventType === 'UPDATE') handler.current(p.new as RealtimeMessageRow, p.eventType);
        if (p.eventType === 'INSERT' && (p.new as RealtimeMessageRow).sender_id !== selfId) setOtherTyping(false);
      })
      .on('broadcast', { event: 'typing' }, (p) => {
        if ((p.payload as { by?: string }).by === selfId) return;
        setOtherTyping(true);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setOtherTyping(false), 4000);
      })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    channel.current = ch;
    return () => {
      if (timer) clearTimeout(timer);
      void supabase?.removeChannel(ch);
      channel.current = null;
      setLive(false);
    };
  }, [threadId, selfId]);

  const sendTyping = useCallback(() => {
    const now = Date.now();
    if (!channel.current || now - lastSent.current < 2000) return;
    lastSent.current = now;
    void channel.current.send({ type: 'broadcast', event: 'typing', payload: { by: selfId } });
  }, [selfId]);

  return { otherTyping, sendTyping, live };
}

/** triage:<tenant_id>:<coach_id> (K-1): calls `onChange` whenever a triage item for this tenant changes. */
export function useTriageRealtime(tenantId: string | null, coachId: string | null, onChange: () => void): boolean {
  const [live, setLive] = useState(false);
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  }, [onChange]);
  useEffect(() => {
    if (!supabase || !tenantId || !coachId) return;
    const ch = supabase
      .channel(`triage:${tenantId}:${coachId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'triage_items', filter: `tenant_id=eq.${tenantId}` }, () => cb.current())
      .subscribe((s) => setLive(s === 'SUBSCRIBED'));
    return () => {
      void supabase?.removeChannel(ch);
      setLive(false);
    };
  }, [tenantId, coachId]);
  return live;
}
