import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { IconButton, Monogram, Text, TextField, useTheme, margin, radius, space, Screen } from '@spotter/ui';
import { SyncBanner } from '../../src/SyncBanner';
import { tenant } from '../../src/env';
import { isOn } from '../../src/modules';
import { useApp, type ChatMessage } from '../../src/store';
import { useSync, syncQueue } from '../../src/sync';

/** C-6 thread with the coach. Messages queue offline and show "Waiting to send" until synced. */
export default function CoachThread() {
  const { colors } = useTheme();
  const messages = useApp((s) => s.messages);
  const sendMessage = useApp((s) => s.sendMessage);
  useSync((s) => s.status); // re-render when the queue changes
  const pendingIds = new Set(syncQueue.pending().map((p) => p.mutation.clientMutationId));
  const [draft, setDraft] = useState('');
  const coach = tenant.coach;
  const first = coach.name.split(' ')[0];

  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    await sendMessage(body);
  };

  return (
    <Screen
      scroll={false}
      banner={<SyncBanner />}
      footer={
        <View style={styles.composer}>
          <View style={{ flex: 1 }}>
            <TextField label={`Message ${first}`} value={draft} onChangeText={setDraft} multiline placeholder="Write a message" />
          </View>
          <IconButton icon="send" label="Send" onPress={() => void send()} />
        </View>
      }
    >
      <View style={[styles.head, { borderBottomColor: colors.line }]}>
        <Monogram initials={coach.monogram} size={40} label={coach.name} />
        <View style={{ flex: 1 }}>
          <Text variant="headline" accessibilityRole="header">
            {coach.name}
          </Text>
          <Text variant="caption" color="ink2">
            Usually replies within a day
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
          renderItem={({ item }) => <Bubble m={item} waiting={!!item.mutationId && pendingIds.has(item.mutationId)} />}
        />
      )}
    </Screen>
  );
}

function Bubble({ m, waiting }: { m: ChatMessage; waiting: boolean }) {
  const { colors } = useTheme();
  const mine = m.from === 'client';
  const time = new Date(m.sentAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <View style={[styles.bubble, { backgroundColor: mine ? colors.surface : 'transparent', borderColor: colors.line }]}>
        <Text>{m.body}</Text>
      </View>
      <View style={styles.meta}>
        {waiting ? <Feather name="clock" size={12} color={colors.ink2} /> : null}
        <Text variant="caption" color="ink2">
          {waiting ? 'Waiting to send' : time}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: margin, paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space[1] },
  bubble: { maxWidth: '85%', padding: space[3], borderRadius: radius.sheet, borderWidth: StyleSheet.hairlineWidth },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
});
