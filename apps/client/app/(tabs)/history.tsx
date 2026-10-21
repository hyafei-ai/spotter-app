import { View } from 'react-native';
import { router } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { formatDuration, volumeKg } from '@spotter/core';
import { EmptyState, ListRow, Screen, ScreenHeader, Tag, Text, margin, space } from '@spotter/ui';
import { shortDate, w } from '../../src/format';
import { useApp } from '../../src/store';

/** C-9 History: newest first, real logged data only. */
export default function History() {
  const completed = useApp((s) => s.completed);
  const rows = [...completed].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return (
    <Screen scroll={false}>
      <ScreenHeader title="History" />
      {rows.length === 0 ? (
        <EmptyState message="No sessions yet. Your first one will show up here." actionLabel="Go to Today" onAction={() => router.push('/today')} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(s) => s.sessionId}
          ListFooterComponent={<View style={{ height: space[8] }} />}
          renderItem={({ item, index }) => (
            <ListRow
              title={`${item.title} · ${shortDate(item.date)}`}
              subtitle={`${item.sets.length} sets · ${formatDuration((Date.parse(item.finishedAt) - Date.parse(item.startedAt)) / 1000)} · ${w(volumeKg(item.sets))}`}
              right={item.variant === 'lighter' ? <Tag label="Easier version" /> : item.variant === 'recovery' ? <Tag label="Recovery" /> : undefined}
              chevron
              last={index === rows.length - 1}
              onPress={() => router.push(`/history/${item.sessionId}`)}
            />
          )}
        />
      )}
      <Text variant="caption" color="ink2" style={{ paddingHorizontal: margin, paddingBottom: space[2] }}>
        {rows.length ? 'Last 30 days are available offline.' : ''}
      </Text>
    </Screen>
  );
}
