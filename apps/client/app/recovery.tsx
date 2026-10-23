import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, IconButton, MiniBars, MiniSpark, Screen, SectionLabel, Text, margin, space } from '@spotter/ui';
import { hours, useRecovery } from '../src/body/useRecovery';
import { Explain } from '../src/explain/Explain';
import { tenant } from '../src/env';

/**
 * Recovery (Body → Recovery, and the sleep/HRV/resting-HR chips on Today): sleep, HRV and resting heart rate,
 * each as a chart against the person's own usual, one plain line, then the numbers.
 */
export default function Recovery() {
  const r = useRecovery();
  const first = tenant.coach.name.split(' ')[0] ?? '';
  const back = () => (router.canGoBack() ? router.back() : router.replace('/body'));
  const nights = r.sleep.nights;
  return (
    <Screen>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Recovery
        </Text>
        <Text variant="headline">{r.headline}</Text>
        <Text color="ink2">{r.source ? `From ${r.source}${r.origin === 'mock' ? ' (sample data)' : ''}. Compared with your own usual.` : 'Compared with your own usual.'}</Text>
        <Explain term="usual" />
      </View>

      {r.empty ? (
        <View style={styles.body}>
          <Text>Connect Apple Health (or Health Connect on Android) and your sleep, HRV and resting heart rate show here.</Text>
          <Button label="Connect in Me" kind="secondary" full={false} onPress={() => router.push('/me')} />
        </View>
      ) : (
        <>
          <SectionLabel>Sleep</SectionLabel>
          <View style={styles.body}>
            <Text variant="bodyStrong">{r.sleep.line}</Text>
            <MiniBars
              values={nights}
              reference={r.sleep.usual}
              max={10}
              height={96}
              emphasis={(i) => i === nights.length - 1}
              label={`Sleep, last 14 nights, oldest first: ${nights.map((n) => hours(n)).join(', ')}.${r.sleep.usual != null ? ` Your usual: ${hours(r.sleep.usual)}.` : ''}`}
            />
            <View style={styles.axis}>
              <Text variant="caption" color="ink2">
                14 nights ago
              </Text>
              <Text variant="caption" color="ink2">
                Last night
              </Text>
            </View>
            <Text variant="caption" color="ink2" tabular>
              {`Last night ${hours(r.sleep.last)}${r.sleep.usual != null ? ` · your usual ${hours(r.sleep.usual)} (dashed line)` : ''}`}
            </Text>
          </View>

          <SectionLabel>Heart-rate variability (HRV)</SectionLabel>
          <View style={styles.body}>
            <Text variant="bodyStrong">{r.hrv.plain}</Text>
            <MiniSpark values={r.hrv.values} band={r.hrv.band} height={80} label={`HRV, last 14 days. ${r.hrv.plain} ${r.hrv.numbers ?? ''}`} />
            <Text variant="caption" color="ink2" tabular>
              {r.hrv.numbers ? `${r.hrv.numbers}. Shaded band: your usual range.` : 'Shaded band: your usual range, once there’s a week of readings.'}
            </Text>
            <Explain term="hrv" />
          </View>

          <SectionLabel>Resting heart rate</SectionLabel>
          <View style={styles.body}>
            <Text variant="bodyStrong">{r.rhr.plain}</Text>
            <MiniSpark values={r.rhr.values} band={r.rhr.band} height={80} label={`Resting heart rate, last 14 days. ${r.rhr.plain} ${r.rhr.numbers ?? ''}`} />
            <Text variant="caption" color="ink2" tabular>
              {r.rhr.numbers ? `${r.rhr.numbers}. Shaded band: your usual range.` : 'Shaded band: your usual range.'}
            </Text>
            <Explain term="resting_hr" />
          </View>

          <View style={[styles.body, { paddingTop: space[6] }]}>
            <Text variant="caption" color="ink2">
              {`${first} never sees these numbers. When you share your daily read, ${first} sees the plain sentence only (for example “HRV under your usual”). A guide, not medical advice.`}
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2], paddingBottom: space[2] },
  body: { paddingHorizontal: margin, paddingTop: space[3], gap: space[2] },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
});
