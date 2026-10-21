import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button, ListRow, SectionLabel, Skeleton, Text, margin, space } from '@spotter/ui';
import { useClientMemory } from './useClientMemory';
import { FollowUpSheet } from './FollowUpSheet';

export const memoryDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

/** Client detail (K-3): the few things worth remembering right now, with the full timeline a tap away. */
export function RememberSection({ clientId }: { clientId: string }) {
  const { client, memory, status, retry } = useClientMemory(clientId);
  const [remind, setRemind] = useState(false);
  const first = client?.name.split(' ')[0] ?? 'them';
  const top = [...memory.filter((m) => m.important), ...memory.filter((m) => !m.important)].slice(
    0,
    4,
  );

  return (
    <>
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
        Remember
      </SectionLabel>
      {status === 'loading' ? (
        <View style={{ paddingHorizontal: margin, paddingTop: space[3], gap: space[2] }}>
          <Skeleton width="70%" />
          <Skeleton width="55%" />
        </View>
      ) : status === 'error' ? (
        <View
          style={{
            paddingHorizontal: margin,
            paddingTop: space[3],
            gap: space[2],
            alignItems: 'flex-start',
          }}
        >
          <Text color="ink2">Couldn’t load your notes and follow-ups.</Text>
          <Button label="Try again" kind="quiet" icon="refresh-cw" full={false} onPress={retry} />
        </View>
      ) : top.length === 0 ? (
        <Text color="ink2" style={{ paddingHorizontal: margin, paddingTop: space[3] }}>
          Nothing to remember yet. Add a note or a reminder and it’ll show up here.
        </Text>
      ) : (
        top.map((m) => <ListRow key={m.id} title={m.text} subtitle={memoryDate(m.date)} />)
      )}
      <ListRow
        title={`Everything about ${first}`}
        subtitle="Notes, follow-ups and what’s happened, by week"
        chevron
        last
        onPress={() => router.push(`/client/${clientId}/memory`)}
      />
      <FollowUpSheet
        clientId={clientId}
        firstName={first}
        visible={remind}
        onClose={() => setRemind(false)}
      />
    </>
  );
}
