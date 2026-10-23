import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { MOBILITY_KIND_LABEL, mobilityFromImported, weekMinutes } from '@spotter/core';
import { IconButton, ListRow, MiniBars, Screen, SectionLabel, Tag, Text, margin, space } from '@spotter/ui';
import { shortDate } from '../src/format';
import { localDate } from '../src/nutrition/store';
import { useMobility } from '../src/mobility/store';
import { useHealthImports } from '../src/health/store';
import { MobilityLog } from '../src/mobility/MobilityLog';
import { WhoSeesLink } from '../src/sharing/WhoSeesLink';
import { tenant } from '../src/env';

/** Mobility (Train → Mobility, Body → Mobility): log in a tap, see this week, and the recent list. */
export default function Mobility() {
  const logs = useMobility((s) => s.logs);
  const share = useMobility((s) => s.shareWithCoach);
  const workouts = useHealthImports((s) => s.workouts);
  const origin = useHealthImports((s) => s.origin);
  const imported = workouts.map(mobilityFromImported).filter((x): x is NonNullable<typeof x> => !!x);
  const all = [...logs, ...imported].sort((a, b) => b.date.localeCompare(a.date));
  const week = weekMinutes(all, localDate());
  const first = tenant.coach.name.split(' ')[0] ?? '';
  const back = () => (router.canGoBack() ? router.back() : router.replace('/train'));
  return (
    <Screen>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Mobility
        </Text>
        <Text variant="headline">{week.total ? `${week.total} min in the last 7 days` : 'None in the last 7 days'}</Text>
        {week.total ? (
          <>
            <MiniBars values={week.days.map((m) => (m ? m : null))} height={56} emphasis={(i) => i === 6} label={`Mobility minutes, last 7 days, oldest first: ${week.days.join(', ')}.`} />
            <Text variant="caption" color="ink2">
              Last 7 days, today on the right. Yoga and stretching from your watch count too.
            </Text>
          </>
        ) : (
          <Text color="ink2">Ten minutes of stretching counts. Yoga and stretching from your watch show up here on their own.</Text>
        )}
      </View>
      <MobilityLog heading="Log a session" />
      <View style={[styles.head, { paddingTop: space[2] }]}>
        <Text variant="caption" color="ink2">
          {share ? `${first} sees your mobility with your sessions.` : `Only you see your mobility.`}
        </Text>
        <WhoSeesLink />
      </View>
      <SectionLabel>Recent</SectionLabel>
      {all.length === 0 ? (
        <View style={styles.head}>
          <Text color="ink2">Nothing logged yet.</Text>
        </View>
      ) : (
        all.slice(0, 30).map((l, i, arr) => (
          <ListRow
            key={l.id}
            title={`${l.minutes} min · ${MOBILITY_KIND_LABEL[l.kind]}`}
            subtitle={shortDate(l.date)}
            right={l.source === 'imported' ? <Tag label={origin === 'mock' ? 'Sample' : 'From your watch'} /> : undefined}
            last={i === arr.length - 1}
          />
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2], paddingTop: space[1] },
});
