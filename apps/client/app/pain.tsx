import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { BODY_REGION_LABEL, ongoingPain, painText, returnGuidance } from '@spotter/core';
import { Button, EmptyState, IconButton, Screen, SectionLabel, Skeleton, Tag, Text, margin, space } from '@spotter/ui';
import { tenant } from '../src/env';
import { shortDate } from '../src/format';
import { localDate } from '../src/nutrition/store';
import { useInjury } from '../src/injury/store';
import { PainCheck, PainToggle, painLabel } from '../src/injury/PainCheck';
import { WhoSeesLink } from '../src/sharing/WhoSeesLink';
import { useInjurySignals } from '../src/brief/useBrief';

/** Body → Pain: what's been logged, conservative return-to-training guidance, sharing per log. */
export default function Pain() {
  const hydrated = useInjury((s) => s.hydrated);
  const logs = useInjury((s) => s.logs);
  const update = useInjury((s) => s.update);
  const remove = useInjury((s) => s.remove);
  const painShareDefault = useInjury((s) => s.shareDefault);
  const { regions } = useInjurySignals();
  const first = tenant.coach.name.split(' ')[0] ?? '';
  const today = localDate();
  const ongoing = ongoingPain(logs, today);
  const spikes = regions.filter((r) => r.spike);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/body'));
  const recent = [...logs].reverse().slice(0, 30);
  const [logging, setLogging] = useState(false);

  return (
    <Screen footer={logging ? <Button label="Cancel" kind="quiet" onPress={() => setLogging(false)} /> : <Button label="Log pain" icon="plus" onPress={() => setLogging(true)} />}>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Pain
        </Text>
        <Text color="ink2">Log anything that hurts, so you and {first} can work around it. Not a diagnosis.</Text>
        <WhoSeesLink label={`${painShareDefault ? `${first} sees new logs` : 'New logs are only for you'} · Who sees what`} />
      </View>
      {logging ? (
        <View style={[styles.body, { paddingBottom: space[4] }]}>
          <Text variant="headline">Where does it hurt?</Text>
          <PainCheck startOpen bare onSaved={() => setLogging(false)} />
        </View>
      ) : null}
      {!hydrated ? (
        <View style={styles.body}>
          <Skeleton height={48} />
        </View>
      ) : logs.length === 0 ? (
        logging ? null : <EmptyState message="Nothing hurting. If something starts to, log it here or in today’s check." />
      ) : (
        <>
          {ongoing.map((p) => (
            <View key={p.region} style={styles.body}>
              <Text variant="bodyStrong">{painText(p)}</Text>
              {returnGuidance(p.region, p.latestLevel, first).map((g) => (
                <Text key={g} variant="callout">
                  {'· '}
                  {g}
                </Text>
              ))}
            </View>
          ))}
          {spikes.length ? (
            <View style={styles.body}>
              {spikes.map((r) => (
                <Text key={r.region} variant="callout">{`${BODY_REGION_LABEL[r.region]} load this week is ${r.ratio}× your usual.`}</Text>
              ))}
              <Text variant="caption" color="ink2">
                From your sessions and imported workouts. A quick rise in load is worth easing back on, especially with pain.
              </Text>
            </View>
          ) : null}
          <SectionLabel>Logged</SectionLabel>
          {recent.map((l) => (
            <View key={l.id} style={[styles.body, styles.log]}>
              <View style={styles.row}>
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {painLabel(l)}
                </Text>
                <Tag label={l.shareWithCoach ? `Shared with ${first}` : 'Private'} tone={l.shareWithCoach ? 'neutral' : 'brand'} />
              </View>
              <Text variant="caption" color="ink2">
                {shortDate(l.date)}
                {l.note ? ` · “${l.note}”` : ''}
              </Text>
              <PainToggle label={`Share with ${first}`} value={l.shareWithCoach} onChange={(shareWithCoach) => void update(l.id, { shareWithCoach })} />
              <Button label="Delete" kind="quiet" full={false} onPress={() => void remove(l.id)} />
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1], paddingBottom: space[2] },
  body: { paddingHorizontal: margin, paddingVertical: space[2], gap: space[1] },
  log: { gap: space[1] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
