import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  READINESS_LABEL,
  bottleneckStations,
  daysToRace,
  formatRaceTime,
  movementTrends,
  predictRaceFinish,
  raceReadiness,
  scoreHistories,
  type ClientDay,
  type ScoredSession,
} from '@spotter/core';
import { demoRaceEvidence, isoDay } from '@spotter/core/demo';
import { Button, ListRow, SectionLabel, Tag, Text, useTheme, margin, space } from '@spotter/ui';
import { tenant } from '../env';
import { longDate } from '../format';
import { useRaceGoal } from './race';

/** The scored blocks in a client's timeline, per session (what Results reads). */
export function scoredFrom(days: ClientDay[]): ScoredSession[] {
  return days.flatMap((d) =>
    d.training.sessions
      .filter((s) => s.scores?.length)
      .map((s) => ({ date: d.date, results: s.scores!.map((sc) => ({ key: sc.key, label: sc.label, kind: sc.kind, scoring: sc.scoring, score: sc.score, splits: sc.splits })) })),
  );
}

/**
 * Results that aren't lifts (docs/ux/multisport.md 5.10, docs/ports.md row 7): each repeated benchmark, interval set
 * or race sim with its latest, best and trend; and, for race-format clients, the station that costs most.
 */
export function ClientResults({ days, first }: { days: ClientDay[]; first: string }) {
  const { colors } = useTheme();
  const scored = useMemo(() => scoredFrom(days), [days]);
  const histories = useMemo(() => scoreHistories(scored, tenant.units, 'coach').filter((h) => h.entries.length > 1).slice(0, 4), [scored]);
  const sims = useMemo(
    () => scored.flatMap((s) => s.results.filter((r) => r.kind === 'station_race').map((r) => ({ date: s.date, splits: r.splits }))),
    [scored],
  );
  const bottleneck = useMemo(() => bottleneckStations(sims), [sims]);
  const trends = useMemo(() => movementTrends(sims).filter((t) => Math.abs(t.deltaPct) >= 1).slice(0, 3), [sims]);
  if (!histories.length) return null;
  return (
    <View>
      <Text variant="title" accessibilityRole="header" style={styles.title}>
        {`${first}’s results`}
      </Text>
      <Text variant="caption" color="ink2" style={styles.sub}>
        Benchmarks, intervals and race simulations, each against their own earlier results.
      </Text>
      {histories.map((h, i) => (
        <ListRow key={h.key} title={h.line} subtitle={h.trend ?? undefined} last={i === histories.length - 1 && !bottleneck} />
      ))}
      {bottleneck && (bottleneck.coachLines.length || trends.length) ? (
        <>
          <SectionLabel>Race simulations: where time goes</SectionLabel>
          <View style={[styles.box, { borderLeftColor: colors.brand }]}>
            {bottleneck.coachLines.map((l) => (
              <Text key={l} variant="callout">
                {l}
              </Text>
            ))}
            {trends.map((t) => (
              <Text key={t.name} variant="callout" color="ink2">
                {t.line.replace(/your last/, 'the last')}
              </Text>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/** Race goal on the client page: countdown, estimate with its evidence, and readiness as plain dimensions (no score). */
export function ClientRace({ clientId, first }: { clientId: string; first: string }) {
  const { colors } = useTheme();
  const { goal, loaded } = useRaceGoal(clientId);
  const today = isoDay(0);
  const ev = useMemo(() => demoRaceEvidence(clientId), [clientId]);
  if (!loaded) return null;
  const open = () => router.push(`/client/${clientId}/race`);
  if (!goal) {
    return (
      <View>
        <SectionLabel>Race</SectionLabel>
        <View style={styles.body}>
          <Text color="ink2">{`No race yet. Set one when ${first} enters, and you’ll see a countdown and how ready they are.`}</Text>
          <Button label="Set a race goal" icon="flag" kind="quiet" full={false} onPress={open} />
        </View>
      </View>
    );
  }
  const days = daysToRace(goal.date, today);
  const raceFormat = goal.kind === 'race_sim' && goal.format;
  const est = raceFormat ? predictRaceFinish({ race: { date: goal.date, format: goal.format! }, today, officialRaces: [], sims: ev.sims }) : null;
  const ready = raceReadiness({ race: { date: goal.date, format: goal.format }, today, sessions: ev.sessions });
  const when = days > 1 ? `in ${days} days` : days === 1 ? 'tomorrow' : days === 0 ? 'today' : `${-days} days ago`;
  return (
    <View>
      <SectionLabel right={<Text variant="bodyStrong" style={{ color: colors.brand }} accessibilityRole="button" onPress={open}>Change</Text>}>Race</SectionLabel>
      <View style={styles.body}>
        <Text variant="headline">{goal.event}</Text>
        <Text variant="callout" color="ink2">{`${longDate(goal.date)} · ${when}${goal.targetSec ? ` · target ${formatRaceTime(goal.targetSec)}` : ''}`}</Text>
      </View>
      {est ? (
        <View style={[styles.box, { borderLeftColor: colors.line }]}>
          <Text variant="label" color="ink2">
            Finish estimate
          </Text>
          <Text variant="figure" tabular>
            {est.estimateSec ? formatRaceTime(est.estimateSec) : '—'}
          </Text>
          <Text variant="caption" color="ink2">
            {est.evidence}
          </Text>
          {est.lines.map((l) => (
            <Text key={l} variant="caption" color="ink2">
              {l}
            </Text>
          ))}
        </View>
      ) : null}
      <SectionLabel>{`How ready ${first} is`}</SectionLabel>
      {ready.dimensions.map((d, i) => (
        <ListRow
          key={d.kind}
          title={`${READINESS_LABEL[d.kind]}: ${d.reading}`}
          subtitle={d.action}
          right={d.needsAttention ? <Tag label="Look" tone="warning" /> : undefined}
          last={i === ready.dimensions.length - 1}
        />
      ))}
      <Text variant="caption" color="ink2" style={styles.sub}>
        Each dimension compares {first} with their own history. There’s no overall score.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { paddingHorizontal: margin, paddingTop: space[8] },
  sub: { paddingHorizontal: margin, paddingTop: space[1], paddingBottom: space[2] },
  body: { paddingHorizontal: margin, paddingTop: space[2], gap: space[2] },
  box: { marginHorizontal: margin, marginTop: space[3], borderLeftWidth: 3, paddingLeft: space[3], gap: 2 },
});
