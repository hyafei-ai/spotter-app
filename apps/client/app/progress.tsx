import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { consistencyText, trendText, type E1rmTrend } from '@spotter/core';
import { EmptyState, IconButton, ListRow, MiniBars, MiniSpark, Screen, SectionLabel, Text, margin, space } from '@spotter/ui';
import { shortDate } from '../src/format';
import { useProgress } from '../src/brief/progress';
import { useWins } from '../src/wins/useWins';

const KIND_LABEL = {
  raw_best: 'Best yet',
  phase_best: 'Best in this phase',
  rep_best: 'Rep best',
  era_best: 'Best in a while',
  holding_strong: 'Strength held',
  volume_week: 'Biggest week',
  session_sets: 'Most work',
  density: 'Faster',
  capability_reached: 'Goal reached',
  capability_best: 'Goal best',
  resting_hr: 'From your watch',
  hrv_baseline: 'From your watch',
  sleep_regularity: 'From your watch',
  score_best: 'Best yet',
} as const;

/**
 * Progress beyond raw PRs (docs/features/brief.md): rep bests at a weight, estimated-max trend, bests
 * compared within the same cycle phase (when cycle data exists) and showing up week after week.
 * Everything here comes from logged sets; nothing is rounded up.
 */
export default function Progress() {
  const { trends, consistency, phaseAware, histories, scoresFirst } = useProgress();
  const allWins = useWins();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/train'));
  const empty = allWins.length === 0 && trends.length === 0 && consistency.done === 0 && histories.length === 0;
  const scores = histories.length ? (
    <>
      <SectionLabel>Benchmarks and times</SectionLabel>
      {histories.slice(0, 8).map((h, i, arr) => (
        <ListRow key={`${h.key}-${h.scoring}`} title={h.line} subtitle={h.trend ?? (h.entries.length === 1 ? 'Do it again to see how it moves' : undefined)} last={i === arr.length - 1} />
      ))}
    </>
  ) : null;

  return (
    <Screen>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Progress
        </Text>
        <Text color="ink2">More than one-rep maxes: reps, strength held, trends and showing up. Tap share on a win to post it.</Text>
      </View>
      {empty ? (
        <EmptyState message="Log a few sessions and your progress shows up here." actionLabel="Go to Today" onAction={() => router.push('/today')} />
      ) : (
        <>
          {scoresFirst ? scores : null}
          <SectionLabel>Consistency</SectionLabel>
          <View style={styles.body}>
            <Text variant="callout">{consistencyText(consistency)}</Text>
            <MiniBars
              values={consistency.weeks.map((w) => w.done)}
              reference={consistency.weeks[consistency.weeks.length - 1]?.planned ?? null}
              emphasis={(i) => i === consistency.weeks.length - 1}
              height={64}
              label={`Sessions in each of the last ${consistency.weeks.length} weeks, oldest first: ${consistency.weeks.map((w) => w.done).join(', ')}.`}
            />
            <Text variant="caption" color="ink2">
              Sessions in each of the last {consistency.weeks.length} weeks, this week on the right.
            </Text>
          </View>

          <SectionLabel>Recent wins</SectionLabel>
          {allWins.length ? (
            allWins.slice(0, 12).map((w, i, arr) => (
              <ListRow
                key={w.id}
                title={w.text}
                subtitle={`${KIND_LABEL[w.kind as keyof typeof KIND_LABEL] ?? 'This week'} · ${shortDate(w.date)}`}
                right={<IconButton icon="share" label={`Share: ${w.text}`} onPress={() => router.push({ pathname: '/share-win', params: { id: w.id } })} />}
                last={i === arr.length - 1}
              />
            ))
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

          {!scoresFirst ? scores : null}
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
  const best = t.points.length ? Math.max(...t.points.map((p) => p.e1rm)) : null;
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="bodyStrong">{trendText(t)}</Text>
      {t.points.length > 1 ? (
        <MiniSpark values={t.points.map((p) => p.e1rm)} height={48} label={`${trendText(t)}. Estimated max per session, oldest first: ${t.points.map((p) => `${p.e1rm} kg`).join(', ')}.`} />
      ) : null}
      {best != null ? (
        <Text variant="caption" color="ink2" tabular>
          {`One point per session, oldest on the left · best ${best} kg`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1], paddingBottom: space[2] },
  body: { paddingHorizontal: margin, paddingVertical: space[2], gap: space[2] },
});
