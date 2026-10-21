import { useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { uploadLabel } from '@spotter/core';
import { Button, EmptyState, IconButton, ListRow, Screen, ScreenHeader, Skeleton, Tag, margin, space } from '@spotter/ui';
import { tenant } from '../../src/env';
import { useFormChecks, useMergedChecks } from '../../src/formchecks/store';
import { loadSeenReplies, useSeenReplies } from '../../src/formchecks/seen';

/** All of the client's form checks, newest first (reached from the Coach tab and Today). */
export default function FormChecks() {
  const loaded = useFormChecks((s) => s.loaded);
  const load = useFormChecks((s) => s.load);
  const checks = useMergedChecks();
  const seen = useSeenReplies((s) => s.seen);
  const first = tenant.coach.name.split(' ')[0];
  useEffect(() => {
    if (!loaded) void load();
    void loadSeenReplies();
  }, [loaded, load]);

  return (
    <Screen footer={<Button label="Send a form check" icon="video" onPress={() => router.push('/form-check/new')} />}>
      <View style={{ paddingHorizontal: space[2], paddingTop: space[2] }}>
        <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/coach'))} />
      </View>
      <ScreenHeader title="Form checks" />
      {!loaded ? (
        <View style={{ paddingHorizontal: margin, gap: space[3] }}>
          <Skeleton height={48} />
          <Skeleton height={48} />
        </View>
      ) : checks.length === 0 ? (
        <EmptyState message={`No form checks yet. Film a set and ${first} will reply on the video.`} />
      ) : (
        checks.map((c, i) => {
          const isNew = c.upload.status === 'replied' && !seen.has(c.id);
          return (
            <ListRow
              key={c.id}
              title={c.exerciseName}
              subtitle={[c.setLabel, new Date(c.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}
              reason={c.upload.status === 'replied' ? `${first} replied` : c.upload.status === 'sent' ? `Sent · waiting for ${first}` : uploadLabel(c.upload)}
              right={isNew ? <Tag label="New" tone="brand" /> : undefined}
              chevron
              last={i === checks.length - 1}
              onPress={() => router.push(`/form-check/${c.id}`)}
            />
          );
        })
      )}
    </Screen>
  );
}
