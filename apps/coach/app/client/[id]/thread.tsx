import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { IconButton, Screen, Text, TextField, useTheme, margin, radius, space } from '@spotter/ui';
import { useCoach } from '../../../src/store';

interface Msg {
  id: string;
  mine: boolean;
  body: string;
  at: string;
}

/** Coach side of a client thread. MOCK: local only until the thread:<id> realtime channel is wired. */
export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const c = useCoach((s) => s.clients.find((x) => x.id === id));
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const first = c?.name.split(' ')[0] ?? 'client';

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    setMsgs((m) => [...m, { id: String(Date.now()), mine: true, body, at: new Date().toISOString() }]);
    setDraft('');
  };

  return (
    <Screen
      scroll={false}
      footer={
        <View style={styles.composer}>
          <View style={{ flex: 1 }}>
            <TextField label={`Message ${first}`} value={draft} onChangeText={setDraft} multiline />
          </View>
          <IconButton icon="send" label="Send" onPress={send} />
        </View>
      }
    >
      <View style={[styles.head, { borderBottomColor: colors.line }]}>
        <IconButton icon="arrow-left" label="Back" onPress={() => router.back()} />
        <Text variant="headline" accessibilityRole="header">
          {c?.name ?? 'Thread'}
        </Text>
      </View>
      {msgs.length === 0 ? (
        <Text color="ink2" style={{ padding: margin }}>
          No messages yet. A short note after their next session goes a long way.
        </Text>
      ) : (
        <FlatList
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: margin, gap: space[3] }}
          renderItem={({ item }) => (
            <View style={{ alignItems: item.mine ? 'flex-end' : 'flex-start' }}>
              <View style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                <Text>{item.body}</Text>
              </View>
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space[1], paddingHorizontal: space[2], paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space[1] },
  bubble: { maxWidth: '85%', padding: space[3], borderRadius: radius.sheet, borderWidth: StyleSheet.hairlineWidth },
});
