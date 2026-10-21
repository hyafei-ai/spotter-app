import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import {
  Banner,
  Button,
  EmptyState,
  IconButton,
  ListRow,
  Screen,
  SectionLabel,
  Skeleton,
  Tag,
  Text,
  TextField,
  useToast,
  margin,
  space,
} from '@spotter/ui';
import { useCoach } from '../../../src/store';
import { useMemory } from '../../../src/memory/store';
import { setFollowUpDone, useClientMemory } from '../../../src/memory/useClientMemory';
import { FollowUpSheet } from '../../../src/memory/FollowUpSheet';
import { memoryDate } from '../../../src/memory/RememberSection';

/** Coach memory timeline (docs/features/coach-memory.md): what a coach would otherwise forget, newest week first. */
export default function Memory() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const net = useNetInfo();
  const pinned = useCoach((s) => s.notes[id]);
  const addNote = useMemory((s) => s.addNote);
  const followUps = useMemory((s) => s.followUps);
  const { client, groups: allGroups, status, retry } = useClientMemory(id);
  // Open follow-ups have their own section above; the timeline is what happened.
  const groups = allGroups
    .map((g) => ({ ...g, items: g.items.filter((m) => m.kind !== 'follow_up') }))
    .filter((g) => g.items.length > 0);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [remind, setRemind] = useState(false);
  const back = (
    <IconButton
      icon="arrow-left"
      label="Back"
      onPress={() => (router.canGoBack() ? router.back() : router.replace(`/client/${id}`))}
    />
  );

  if (!client) {
    return (
      <Screen>
        <View style={styles.nav}>{back}</View>
        <EmptyState
          message="This client isn’t in your list any more."
          actionLabel="Back to clients"
          onAction={() => router.replace('/clients')}
        />
      </Screen>
    );
  }
  const first = client.name.split(' ')[0]!;
  const open = followUps
    .filter((f) => f.clientId === id && !f.doneAt)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));

  const save = async () => {
    setSaving(true);
    try {
      await addNote(id, note);
      setNote('');
      toast({ message: 'Note saved' });
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Couldn’t save the note. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      banner={
        net.isConnected === false ? (
          <Banner tone="warning" message="You’re offline. Showing what’s saved on this phone." />
        ) : undefined
      }
    >
      <View style={styles.nav}>{back}</View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Remember: {first}
        </Text>
        <Text variant="callout" color="ink2">
          Only you and the business owner can see this. {first} never does.
        </Text>
      </View>

      <SectionLabel
        right={
          <Button
            label="Remind me"
            kind="quiet"
            icon="bell"
            full={false}
            onPress={() => setRemind(true)}
          />
        }
      >
        Follow-ups
      </SectionLabel>
      {open.length === 0 ? (
        <Text color="ink2" style={styles.body}>
          Nothing to follow up on. Add a reminder and it shows up in Clients on that day.
        </Text>
      ) : (
        open.map((f, i) => (
          <ListRow
            key={f.id}
            title={f.text}
            subtitle={memoryDate(f.dueOn)}
            last={i === open.length - 1}
            right={
              <Button
                label="Done"
                kind="quiet"
                full={false}
                onPress={() => {
                  void setFollowUpDone(f.id, true);
                  toast({
                    message: 'Follow-up done',
                    actionLabel: 'Undo',
                    onAction: () => void setFollowUpDone(f.id, false),
                  });
                }}
              />
            }
          />
        ))
      )}

      <SectionLabel>Add a note</SectionLabel>
      <View style={[styles.body, { gap: space[2] }]}>
        <TextField
          label="Only you can see notes"
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={4000}
          placeholder="e.g. Travelling 3–10 Nov. Wants to try a 5k in spring."
        />
        <Button
          label="Save note"
          kind="secondary"
          loading={saving}
          disabled={!note.trim()}
          disabledReason="Write the note first."
          onPress={() => void save()}
        />
      </View>
      {pinned?.trim() ? (
        <View style={styles.body}>
          <Text variant="label" color="ink2">
            Pinned note
          </Text>
          <Text variant="callout">{pinned}</Text>
        </View>
      ) : null}

      {status === 'loading' ? (
        <View style={[styles.body, { gap: space[3], paddingTop: space[6] }]}>
          <Skeleton width="40%" />
          <Skeleton width="85%" />
          <Skeleton width="70%" />
        </View>
      ) : status === 'error' ? (
        <View style={{ paddingTop: space[4] }}>
          <EmptyState
            message="Couldn’t load your notes and follow-ups. Check your connection and try again."
            actionLabel="Try again"
            onAction={retry}
          />
        </View>
      ) : groups.length === 0 ? (
        <View style={{ paddingTop: space[4] }}>
          <EmptyState
            message={`Nothing to remember about ${first} yet. Their sessions, reads and messages will show up here.`}
          />
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.label}>
            <SectionLabel>{g.label}</SectionLabel>
            {g.items.map((m, i) => (
              <ListRow
                key={m.id}
                title={m.text}
                subtitle={memoryDate(m.date)}
                right={m.important ? <Tag label="Bring up" tone="warning" /> : undefined}
                last={i === g.items.length - 1}
              />
            ))}
          </View>
        ))
      )}
      <FollowUpSheet
        clientId={id}
        firstName={first}
        visible={remind}
        onClose={() => setRemind(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  body: { paddingHorizontal: margin, paddingTop: space[3] },
});
