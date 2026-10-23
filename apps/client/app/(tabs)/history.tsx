import { View } from 'react-native';
import { router } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { IMPORTED_ACTIVITY_LABEL, formatDuration, volumeKg, type ImportedWorkout } from '@spotter/core';
import { EmptyState, ListRow, Screen, ScreenHeader, Tag, Text, margin, space } from '@spotter/ui';
import { shortDate, w } from '../../src/format';
import { useApp, type CompletedSession } from '../../src/store';
import { useHealthImports, visibleWorkouts } from '../../src/health/store';
import { importedSessions } from '../../src/health/loads';

type Row = { kind: 'session'; at: string; s: CompletedSession } | { kind: 'workout'; at: string; w: ImportedWorkout };

/** "Run · 5.2 km · from Apple Watch". */
function workoutLine(x: ImportedWorkout): string {
  const parts = [x.distanceM ? `${Math.round(x.distanceM / 100) / 10} km` : null, `${Math.round(x.durationMin)} min`, x.sourceApp ? `from ${x.sourceApp}` : null];
  return parts.filter(Boolean).join(' · ');
}

/** C-9 History: newest first, real logged data only, plus workouts imported from the health app. */
export default function History() {
  const completed = useApp((s) => s.completed);
  const workouts = useHealthImports((s) => s.workouts);
  const hidden = useHealthImports((s) => s.hiddenActivities);
  const origin = useHealthImports((s) => s.origin);
  // Workouts that are the same as a Spotter session (>50% overlap) are left out: Spotter's log wins.
  const imported = importedSessions(visibleWorkouts(workouts, hidden), completed).map((x) => x.workout);
  const rows: Row[] = [
    ...completed.map((s) => ({ kind: 'session' as const, at: s.startedAt, s })),
    ...imported.map((x) => ({ kind: 'workout' as const, at: x.startedAt, w: x })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Screen scroll={false}>
      <ScreenHeader title="History" />
      {rows.length === 0 ? (
        <EmptyState message="No sessions yet. Your first one will show up here." actionLabel="Go to Today" onAction={() => router.push('/today')} />
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => (r.kind === 'session' ? r.s.sessionId : `w-${r.w.id}`)}
          ListHeaderComponent={<ListRow title="Progress" subtitle="Rep bests, trends and consistency" chevron onPress={() => router.push('/progress')} />}
          ListFooterComponent={<View style={{ height: space[8] }} />}
          renderItem={({ item, index }) =>
            item.kind === 'session' ? (
              <ListRow
                title={`${item.s.title} · ${shortDate(item.s.date)}`}
                subtitle={`${item.s.sets.length} sets · ${formatDuration((Date.parse(item.s.finishedAt) - Date.parse(item.s.startedAt)) / 1000)} · ${w(volumeKg(item.s.sets))}`}
                right={item.s.variant === 'lighter' ? <Tag label="Easier version" /> : item.s.variant === 'recovery' ? <Tag label="Recovery" /> : undefined}
                chevron
                last={index === rows.length - 1}
                onPress={() => router.push(`/history/${item.s.sessionId}`)}
              />
            ) : (
              <ListRow
                title={`${IMPORTED_ACTIVITY_LABEL[item.w.activity]} · ${shortDate(item.w.date)}`}
                subtitle={workoutLine(item.w)}
                right={<Tag label={origin === 'mock' ? 'Sample' : 'Imported'} />}
                last={index === rows.length - 1}
              />
            )
          }
        />
      )}
      <Text variant="caption" color="ink2" style={{ paddingHorizontal: margin, paddingBottom: space[2] }}>
        {rows.length ? (imported.length && origin === 'mock' ? 'Last 30 days are available offline. Imported workouts here are sample data.' : 'Last 30 days are available offline.') : ''}
      </Text>
    </Screen>
  );
}
