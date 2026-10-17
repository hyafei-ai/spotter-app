import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatDuration } from '@spotter/core';
import { LOWER_A } from '@spotter/core/demo';
import { EmptyState, IconButton, SetRow, Text, margin, space, Screen } from '@spotter/ui';
import { longDate, resultText, targetText } from '../../src/format';
import { useApp } from '../../src/store';

/** Read-only log sheet for a past session. Strikes are drawn without animation. */
export default function SessionLog() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useApp((st) => st.completed.find((c) => c.sessionId === id));
  const back = <IconButton icon="arrow-left" label="Back" onPress={() => router.back()} />;
  if (!s) {
    return (
      <Screen>
        <View style={styles.nav}>{back}</View>
        <EmptyState message="This session isn’t on this phone." actionLabel="Back to History" onAction={() => router.replace('/history')} />
      </Screen>
    );
  }
  // MOCK: the demo resolves the plan locally; real builds read program_exercises from the local cache.
  const plan = LOWER_A;
  return (
    <Screen>
      <View style={styles.nav}>{back}</View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          {s.title}
        </Text>
        <Text color="ink2">
          {longDate(s.date)} · {formatDuration((Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 1000)}
        </Text>
        {s.note ? (
          <Text variant="callout" style={{ marginTop: space[2] }}>
            “{s.note}”
          </Text>
        ) : null}
      </View>
      {plan.exercises.map((e) => {
        const sets = s.sets.filter((x) => x.programExerciseId === e.id).sort((a, b) => a.setIndex - b.setIndex);
        if (!sets.length) return null;
        return (
          <View key={e.id} style={{ paddingTop: space[5] }}>
            <Text variant="headline" style={{ paddingHorizontal: margin, paddingBottom: space[1] }}>
              {e.name}
            </Text>
            {sets.map((x) => (
              <SetRow key={x.id} setNumber={x.setIndex + 1} target={targetText(e, x.setIndex, e.sets[x.setIndex]?.loadKg ?? null)} state="logged" result={resultText(e, x)} />
            ))}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
});
