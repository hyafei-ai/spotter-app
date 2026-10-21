import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { IconButton, ListRow, Monogram, Screen, Sheet, Text, TextField, useTheme, useToast, margin, space } from '@spotter/ui';
import { MessageBubble, VoiceRecorder, useAuth, useThreadRealtime, type RealtimeMessageRow } from '@spotter/ui/platform';
import { SyncBanner } from '../../src/SyncBanner';
import { tenant } from '../../src/env';
import { shortDate } from '../../src/format';
import { isOn } from '../../src/modules';
import { useApp, type ChatMessage } from '../../src/store';
import { useSync, syncQueue } from '../../src/sync';
import { currentThreadId } from '../../src/platform/pulled';
import { applyRealtimeRow, markThreadRead, sendAttachment, useMediaUrl } from '../../src/platform/messaging';

/**
 * C-6 thread with the coach: text, voice notes, photos and links to workouts. Messages queue
 * offline and show "Waiting to send" until synced; read receipts and typing come over realtime.
 */
export default function CoachThread() {
  const { colors } = useTheme();
  const toast = useToast();
  const messages = useApp((s) => s.messages);
  const completed = useApp((s) => s.completed);
  const sendMessage = useApp((s) => s.sendMessage);
  useSync((s) => s.status); // re-render when the queue changes
  const pendingIds = new Set(syncQueue.pending().map((p) => p.mutation.clientMutationId));
  const [draft, setDraft] = useState('');
  const [sheet, setSheet] = useState<'attach' | 'workout' | null>(null);
  const [recording, setRecording] = useState(false);
  const auth = useAuth();
  const coach = tenant.coach;
  const first = coach.name.split(' ')[0];

  const onRow = useCallback((row: RealtimeMessageRow) => applyRealtimeRow(row), []);
  const { otherTyping, sendTyping } = useThreadRealtime(auth.status === 'signedIn' ? currentThreadId() : null, auth.userId, onRow);

  useEffect(() => {
    void markThreadRead();
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    await sendMessage(body);
  };

  const pickPhoto = async () => {
    setSheet(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast({ message: 'Photo access is off. Turn it on in Settings to send photos.' });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: false });
    if (!res.canceled && res.assets[0]) await sendAttachment({ kind: 'image', uri: res.assets[0].uri });
  };

  const lastMine = [...messages].reverse().find((m) => m.from === 'client');
  const recent = [...completed].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8);

  return (
    <Screen
      scroll={false}
      banner={<SyncBanner />}
      footer={
        recording ? (
          <VoiceRecorder
            onCancel={() => setRecording(false)}
            onDone={(uri, durationMs) => {
              setRecording(false);
              void sendAttachment({ kind: 'voice', uri, durationMs });
            }}
          />
        ) : (
          <View style={styles.composer}>
            <IconButton icon="plus" label="Attach a voice note, photo or workout" onPress={() => setSheet('attach')} />
            <View style={{ flex: 1 }}>
              <TextField
                label={`Message ${first}`}
                value={draft}
                onChangeText={(t) => {
                  setDraft(t);
                  sendTyping();
                }}
                multiline
                placeholder="Write a message"
              />
            </View>
            <IconButton icon="send" label="Send" onPress={() => void send()} />
          </View>
        )
      }
    >
      <View style={[styles.head, { borderBottomColor: colors.line }]}>
        <Monogram initials={coach.monogram} size={40} label={coach.name} />
        <View style={{ flex: 1 }}>
          <Text variant="headline" accessibilityRole="header">
            {coach.name}
          </Text>
          <Text variant="caption" color="ink2" accessibilityLiveRegion="polite">
            {otherTyping ? `${first} is typing…` : 'Usually replies within a day'}
          </Text>
        </View>
        {isOn('formChecks') ? <IconButton icon="video" label="Form checks" onPress={() => router.push('/form-check')} /> : null}
      </View>
      {messages.length === 0 ? (
        <Text color="ink2" style={{ padding: margin }}>
          Ask {first} anything about your training. Questions about a lift are easier with a video.
        </Text>
      ) : (
        <FlatList
          data={[...messages].reverse()}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: margin, gap: space[3] }}
          renderItem={({ item }) => (
            <ThreadItem m={item} waiting={!!item.mutationId && pendingIds.has(item.mutationId)} seen={item.id === lastMine?.id && !!item.readAt} />
          )}
        />
      )}

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
        <ListRow title="A workout" subtitle="Share a session from your history" last onPress={() => setSheet('workout')} />
      </Sheet>
      <Sheet visible={sheet === 'workout'} title="Share a workout" onClose={() => setSheet(null)}>
        {recent.length === 0 ? (
          <Text color="ink2" style={{ paddingHorizontal: margin, paddingBottom: space[4] }}>
            Finished sessions show up here.
          </Text>
        ) : (
          recent.map((s, i) => (
            <ListRow
              key={s.sessionId}
              title={`${s.title} · ${shortDate(s.date)}`}
              subtitle={`${s.sets.length} sets`}
              last={i === recent.length - 1}
              onPress={() => {
                setSheet(null);
                void sendAttachment({ kind: 'link', link: { type: 'session', id: s.sessionId, title: `${s.title} · ${shortDate(s.date)}` } });
              }}
            />
          ))
        )}
      </Sheet>
    </Screen>
  );
}

function ThreadItem({ m, waiting, seen }: { m: ChatMessage; waiting: boolean; seen: boolean }) {
  const kind = m.kind ?? 'text';
  const mediaUrl = useMediaUrl(m.mediaUri, m.id, kind);
  return (
    <MessageBubble
      m={{ mine: m.from === 'client', kind, body: m.body, mediaUrl, durationMs: m.durationMs ?? null, link: m.link ?? null, sentAt: m.sentAt, waiting, seen }}
      onOpenLink={(l) => l.type === 'session' && router.push(`/history/${l.id}`)}
    />
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: margin, paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space[1] },
});
