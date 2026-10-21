import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { programSummary } from '@spotter/core';
import { Button, EmptyState, IconButton, ListRow, Screen, SectionLabel, Tag, Text, useToast, margin, space } from '@spotter/ui';
import { useCoach } from '../../../src/store';
import { activeAssignmentFor, usePrograms } from '../../../src/programs';
import { confirm } from '../../../src/confirm';

/** Pick a program for one client (K-3 "Assign/adjust program"); continues to the assign screen with the client preselected. */
export default function ClientProgram() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const client = useCoach((s) => s.clients.find((c) => c.id === id));
  const { programs, assignments, endAssignment, createProgram } = usePrograms();
  const current = activeAssignmentFor(assignments, id);
  const live = programs.filter((p) => p.status === 'published');
  const drafts = programs.filter((p) => p.status === 'draft');
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/client/${id}`));
  const first = client?.name.split(' ')[0] ?? 'this client';

  return (
    <Screen>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="label" color="ink2">
          {client?.name ?? 'Client'}
        </Text>
        <Text variant="title" accessibilityRole="header">
          Choose a program
        </Text>
      </View>
      {live.length === 0 ? (
        <EmptyState
          message="You don’t have a published program yet. Build one first."
          actionLabel="New program"
          onAction={() => router.push(`/program/${createProgram()}`)}
        />
      ) : (
        <>
          <SectionLabel>Published</SectionLabel>
          {live.map((p, i) => (
            <ListRow
              key={p.id}
              title={p.name}
              subtitle={programSummary(p)}
              right={current?.programId === p.id ? <Tag label="Current" tone="success" /> : p.isTemplate ? <Tag label="Template" /> : undefined}
              chevron
              last={i === live.length - 1}
              onPress={() => router.push(`/program/${p.id}/assign?client=${id}`)}
            />
          ))}
        </>
      )}
      {drafts.length ? (
        <Text variant="callout" color="ink2" style={styles.body}>
          {drafts.length} draft{drafts.length === 1 ? '' : 's'} not shown. Publish a draft to assign it.
        </Text>
      ) : null}
      {current ? (
        <View style={styles.body}>
          <Button
            label="Stop the current program"
            kind="quiet"
            onPress={() =>
              confirm('Stop the current program?', `${first} will see “no program yet” until you assign another. Their logged history stays.`, 'Stop', () => {
                endAssignment(current.id);
                toast({ message: 'Program stopped.' });
                back();
              })
            }
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  body: { paddingHorizontal: margin, paddingTop: space[4] },
});
