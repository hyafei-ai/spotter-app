import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { IconButton, ListRow, Screen, SectionLabel, Sheet, Text, TextField, useTheme, useToast, margin, space } from '@spotter/ui';
import { MessageBubble, VoiceRecorder, isConfigured, supabase, useAuth, useThreadRealtime, type RealtimeMessageRow } from '@spotter/ui/platform';
import { tenant } from '../../../src/env';
import { useCoach } from '../../../src/store';
import { useInbox, type CoachMessage } from '../../../src/platform/inbox';
import { FollowUpSheet } from '../../../src/memory/FollowUpSheet';
import { useMemoryLoaded } from '../../../src/memory/store';

// Stable empty list: a fresh [] from the selector would re-render forever (React #185).
const NO_MESSAGES: CoachMessage[] = [];

/**
 * Coach side of a client thread (C-6, K-1): text, voice notes, photos and saved replies,
 * with read receipts and a typing indicator over realtime in connected builds.
 */
export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const auth = useAuth();
  const c = useCoach((s) => s.clients.find((x) => x.id === id));
  const msgs = useInbox((s) => s.threads[id ?? ''] ?? NO_MESSAGES);
  const send = useInbox((s) => s.send);
  const replies = useInbox((s) => s.savedReplies);
  const [draft, setDraft] = useState('');
  const [sheet, setSheet] = useState<'attach' | 'replies' | 'remind' | null>(null);
  const [recording, setRecording] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const first = c?.name.split(' ')[0] ?? 'client';
  useMemoryLoaded();

  // Connected: find the thread and load its messages (RLS limits it to clients this coach can see).
  useEffect(() => {
    if (!isConfigured() || !supabase || auth.status !== 'signedIn' || !id) return;
    void (async () => {
      const { data: th } = await supabase.from('threads').select('id').eq('tenant_id', tenant.id).eq('client_id', id).maybeSingle();
      if (!th) return;
      setThreadId(th.id);
      const { data } = await supabase.from('messages').select('*').eq('thread_id', th.id).order('sent_at').limit(200);
      useInbox.setState({ threads: { ...useInbox.getState().threads, [id]: (data ?? []).map((r) => toCoachMessage(r as RealtimeMessageRow, auth.userId)) } });
      await supabase.rpc('mark_thread_read', { thread: th.id, up_to: new Date().toISOString() });
    })();
  }, [id, auth.status, auth.userId]);

  const onRow = useCallback(
    (row: RealtimeMessageRow) => {
      if (!id) return;
      const list = useInbox.getState().threads[id] ?? [];
      const m = toCoachMessage(row, auth.userId);
      const next = list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? { ...x, readAt: m.readAt } : x)) : [...list, m];
      useInbox.setState({ threads: { ...useInbox.getState().threads, [id]: next } });
    },
    [id, auth.userId],
  );
  const { otherTyping, sendTyping } = useThreadRealtime(threadId, auth.userId, onRow);

  const deliver = async (m: Omit<CoachMessage, 'id' | 'mine' | 'sentAt' | 'readAt'>) => {
    try {
      await send(id!, m);
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Couldn’t send. Try again.' });
    }
  };

  const sendText = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    void deliver({ kind: 'text', body, mediaUri: null, durationMs: null });
  };

  const pickPhoto = async () => {
    setSheet(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast({ message: 'Photo access is off. Turn it on in Settings to send photos.' });
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!res.canceled && res.assets[0]) void deliver({ kind: 'image', body: '', mediaUri: res.assets[0].uri, durationMs: null });
  };

  const lastMine = [...msgs].reverse().find((m) => m.mine);
  return (
    <Screen
      scroll={false}
      footer={
        recording ? (
          <VoiceRecorder
            onCancel={() => setRecording(false)}
            onDone={(uri, durationMs) => {
              setRecording(false);
              void deliver({ kind: 'voice', body: '', mediaUri: uri, durationMs });
            }}
          />
        ) : (
          <View style={styles.composer}>
            <IconButton icon="plus" label="Attach a voice note, photo or saved reply" onPress={() => setSheet('attach')} />
            <View style={{ flex: 1 }}>
              <TextField
                label={`Message ${first}`}
                value={draft}
                onChangeText={(t) => {
                  setDraft(t);
                  sendTyping();
                }}
                multiline
              />
            </View>
            <IconButton icon="send" label="Send" onPress={sendText} />
          </View>
        )
      }
    >
      <View style={[styles.head, { borderBottomColor: colors.line }]}>
        <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/clients'))} />
        <View>
          <Text variant="headline" accessibilityRole="header">
            {c?.name ?? 'Thread'}
          </Text>
          {otherTyping ? (
            <Text variant="caption" color="ink2" accessibilityLiveRegion="polite">
              {first} is typing…
            </Text>
          ) : null}
        </View>
        <View style={{ flex: 1 }} />
        <IconButton icon="bell" label={`Remind me to follow up with ${first}`} onPress={() => setSheet('remind')} />
      </View>
      {msgs.length === 0 ? (
        <Text color="ink2" style={{ padding: margin }}>
          No messages yet. A short note after their next session goes a long way.
        </Text>
      ) : (
        <FlatList
          data={[...msgs].reverse()}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: margin, gap: space[3] }}
          renderItem={({ item }) => (
            <MessageBubble
              m={{
                mine: item.mine,
                kind: item.kind,
                body: item.body,
                mediaUrl: item.mediaUri,
                durationMs: item.durationMs,
                link: null,
                sentAt: item.sentAt,
                waiting: false,
                seen: item.id === lastMine?.id && !!item.readAt,
              }}
            />
          )}
        />
      )}

      <FollowUpSheet clientId={id ?? ''} firstName={first} visible={sheet === 'remind'} onClose={() => setSheet(null)} />
      <Sheet visible={sheet === 'attach'} title="Send" onClose={() => setSheet(null)}>
        <ListRow
          title="Voice note"
          subtitle="Up to 2 minutes"
          onPress={() => {
            setSheet(null);
            setRecording(true);
          }}
        />
        <ListRow title="Photo" subtitle="From your library" onPress={() => void pickPhoto()} />
        <ListRow title="Saved reply" subtitle={replies.length ? `${replies.length} saved` : 'None yet'} last onPress={() => setSheet('replies')} />
      </Sheet>
      <Sheet visible={sheet === 'replies'} title="Saved replies" onClose={() => setSheet(null)}>
        {replies.length === 0 ? (
          <Text color="ink2" style={{ paddingHorizontal: margin, paddingBottom: space[4] }}>
            Save the messages you send often from Me → Saved replies.
          </Text>
        ) : (
          <>
            <SectionLabel>Tap to put it in the message box</SectionLabel>
            {replies.map((r, i) => (
              <ListRow
                key={r.id}
                title={r.title}
                subtitle={r.body}
                last={i === replies.length - 1}
                onPress={() => {
                  setDraft(r.body);
                  setSheet(null);
                }}
              />
            ))}
          </>
        )}
      </Sheet>
    </Screen>
  );
}

function toCoachMessage(r: RealtimeMessageRow, selfId: string | null): CoachMessage {
  return {
    id: r.id,
    mine: r.sender_id === selfId,
    kind: r.kind === 'video' ? 'link' : r.kind,
    body: r.body ?? '',
    // Server media is fetched by signed URL when shown; the path is enough to know it exists.
    mediaUri: null,
    durationMs: r.duration_ms,
    sentAt: r.sent_at,
    readAt: r.read_at,
  };
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space[1], paddingHorizontal: space[2], paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space[1] },
});
