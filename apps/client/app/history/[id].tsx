import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { BLOCK_KIND_LABEL, formatDuration, formatRaceTime, paceText, scoreText } from '@spotter/core';
import { tenant } from '../../src/env';
import { LOWER_A } from '@spotter/core/demo';
import { EmptyState, IconButton, SetRow, StrikeUnder, Text, margin, space, Screen, useTheme } from '@spotter/ui';
import { longDate, resultText, targetText } from '../../src/format';
import { useApp } from '../../src/store';

/** Read-only log sheet for a past session. Strikes are drawn without animation. */
export default function SessionLog() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const s = useApp((st) => st.completed.find((c) => c.sessionId === id));
  const { colors } = useTheme();
  const back = <IconButton icon="arrow-left" label="Back" onPress={() => router.back()} />;
  if (!s) {
    return (
      <Screen>
        <View style={styles.nav}>{back}</View>
        <EmptyState message="This session isn’t on this phone." actionLabel="Back to Train" onAction={() => router.replace('/train')} />
      </Screen>
    );
  }
  // Sessions keep the plan they were run against. MOCK: the seeded demo history predates that, so it uses Lower A.
  const plan = s.plan ?? LOWER_A;
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
      {(s.results ?? []).map((r) => (
        <View key={r.blockId} style={{ paddingTop: space[5] }}>
          <Text variant="label" color="ink2" style={{ paddingHorizontal: margin }}>
            {r.kind === 'rep_scheme' && r.scoring === 'time' ? 'For time' : BLOCK_KIND_LABEL[r.kind]}
          </Text>
          <Text variant="headline" style={{ paddingHorizontal: margin }}>
            {r.label}
          </Text>
          <View style={{ paddingHorizontal: margin, paddingTop: space[1] }}>
            <Text variant="figure" tabular>
              {scoreText(r, tenant.units)}
            </Text>
            <StrikeUnder width={120} />
          </View>
          {r.splits.map((x) => (
            <View key={x.index} style={[styles.split, { borderBottomColor: colors.line }]}>
              <Text variant="callout" style={{ flex: 1 }}>
                {x.name}
              </Text>
              <Text variant="bodyStrong" tabular>
                {formatRaceTime(x.sec)}
              </Text>
              <Text variant="caption" color="ink2" tabular style={{ width: 84, textAlign: 'right' }}>
                {x.distanceM && x.distanceM >= 150 && (x.kind === 'interval' || x.kind === 'run') ? paceText((x.sec / x.distanceM) * 1000) : ''}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  split: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: margin, paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 44 },
});
