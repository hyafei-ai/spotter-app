import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { consistencyText, trendText, type E1rmTrend } from '@spotter/core';
import { EmptyState, IconButton, ListRow, Screen, SectionLabel, Text, useTheme, margin, radius, space } from '@spotter/ui';
import { shortDate } from '../src/format';
import { useProgress } from '../src/brief/progress';

const KIND_LABEL = { raw_best: 'Best yet', phase_best: 'Best in this phase', rep_best: 'Rep best' } as const;

/**
 * Progress beyond raw PRs (docs/features/brief.md): rep bests at a weight, estimated-max trend, bests
 * compared within the same cycle phase (when cycle data exists) and showing up week after week.
 * Everything here comes from logged sets; nothing is rounded up.
 */
export default function Progress() {
  const { wins, trends, consistency, phaseAware } = useProgress();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/me'));
  const empty = wins.length === 0 && trends.length === 0 && consistency.done === 0;

  return (
    <Screen>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Progress
        </Text>
        <Text color="ink2">More than one-rep maxes: reps, trends and showing up.</Text>
      </View>
      {empty ? (
        <EmptyState message="Log a few sessions and your progress shows up here." actionLabel="Go to Today" onAction={() => router.push('/today')} />
      ) : (
        <>
          <SectionLabel>Consistency</SectionLabel>
          <View style={styles.body}>
            <Text variant="callout">{consistencyText(consistency)}</Text>
            <WeekBars weeks={consistency.weeks.map((w) => w.done)} planned={consistency.weeks[0]?.planned ?? null} />
            <Text variant="caption" color="ink2">
              Sessions in each of the last {consistency.weeks.length} weeks, oldest on the left.
            </Text>
          </View>

          <SectionLabel>Recent wins</SectionLabel>
          {wins.length ? (
            wins.slice(0, 12).map((w, i, arr) => <ListRow key={`${w.kind}-${w.exerciseId}-${w.date}`} title={w.text} subtitle={`${KIND_LABEL[w.kind]} · ${shortDate(w.date)}`} last={i === arr.length - 1} />)
          ) : (
            <View style={styles.body}>
              <Text variant="callout" color="ink2">
                No new bests yet. Keep logging: more reps at a weight counts too.
              </Text>
            </View>
          )}
          <View style={styles.body}>
            <Text variant="caption" color="ink2">
              {phaseAware
                ? 'Phase bests compare a lift only with the same phase of your own cycle.'
                : 'Turn on cycle tracking to also see your best lift in each phase, compared only with that phase.'}
            </Text>
          </View>

          <SectionLabel>Estimated max, last 6 weeks</SectionLabel>
          <View style={[styles.body, { gap: space[4] }]}>
            {trends.length ? trends.map((t) => <Trend key={t.exerciseId} t={t} />) : <Text color="ink2">Your main lifts show up here after a few sessions.</Text>}
            <Text variant="caption" color="ink2">
              Estimated from your best set each session (weight and reps). A guide, not a test result.
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

function Trend({ t }: { t: E1rmTrend }) {
  const { colors } = useTheme();
  const max = Math.max(...t.points.map((p) => p.e1rm), 1);
  const min = Math.min(...t.points.map((p) => p.e1rm), max);
  const floor = Math.max(0, min - (max - min || max * 0.1));
  return (
    <View style={{ gap: space[2] }} accessible accessibilityLabel={trendText(t)}>
      <Text variant="bodyStrong">{trendText(t)}</Text>
      <View style={styles.bars}>
        {t.points.map((p) => (
          <View key={p.date} style={[styles.bar, { height: 8 + ((p.e1rm - floor) / (max - floor || 1)) * 40, backgroundColor: colors.brand }]} />
        ))}
      </View>
      {t.points.length ? (
        <Text variant="caption" color="ink2" tabular>
          {`${t.points[0]!.e1rm} kg → ${t.points[t.points.length - 1]!.e1rm} kg`}
        </Text>
      ) : null}
    </View>
  );
}

function WeekBars({ weeks, planned }: { weeks: number[]; planned: number | null }) {
  const { colors } = useTheme();
  const top = Math.max(planned ?? 0, ...weeks, 1);
  return (
    <View style={styles.bars}>
      {weeks.map((n, i) => (
        <View key={i} style={{ alignItems: 'center', gap: 2 }}>
          <View style={[styles.bar, { height: 6 + (n / top) * 40, backgroundColor: n >= 2 ? colors.brand : colors.line }]} />
          <Text variant="caption" color="ink2" tabular>
            {String(n)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1], paddingBottom: space[2] },
  body: { paddingHorizontal: margin, paddingVertical: space[2], gap: space[2] },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: space[2], minHeight: 52 },
  bar: { width: 14, borderRadius: radius.control },
});
