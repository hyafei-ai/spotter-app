import { Platform, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { IconButton, Screen, SectionLabel, SegmentedControl, Skeleton, Text, useTheme, margin, space, touchMin } from '@spotter/ui';
import { tenant } from '../../src/env';
import { useDaily } from '../../src/daily/store';
import { useHealthImports } from '../../src/health/store';
import { hourLabel } from '../../src/daily/DailyCheckRow';

const HOURS = [6, 7, 8, 9].map((h) => ({ value: String(h), label: hourLabel(h) }));

/** Me → Daily check. Reminder, cycle tracking, default sharing, and exactly what the coach sees. */
export default function DailyCheckSettings() {
  const hydrated = useDaily((s) => s.hydrated);
  const settings = useDaily((s) => s.settings);
  const setSettings = useDaily((s) => s.setSettings);
  const first = tenant.coach.name.split(' ')[0] ?? '';
  const back = () => (router.canGoBack() ? router.back() : router.replace('/me'));

  return (
    <Screen>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Daily check
        </Text>
        <Text color="ink2">Sleep, energy, soreness and stress, about 30 seconds a day.</Text>
      </View>
      {!hydrated ? (
        <View style={styles.body}>
          <Skeleton height={48} />
          <Skeleton height={48} />
        </View>
      ) : (
        <>
          <SectionLabel>Reminder</SectionLabel>
          <View style={styles.body}>
            <Toggle label="Morning reminder" value={settings.reminderOn} onChange={(reminderOn) => void setSettings({ reminderOn })} />
            {settings.reminderOn ? (
              <SegmentedControl label="Reminder time" value={String(settings.reminderHour)} onChange={(v) => void setSettings({ reminderHour: Number(v) })} options={HOURS} />
            ) : null}
            {settings.reminderOn && Platform.OS === 'web' ? (
              <Text variant="caption" color="ink2">
                Reminders arrive in the phone app. The card on Today always shows until you check in or skip.
              </Text>
            ) : null}
          </View>

          <SectionLabel>Sharing</SectionLabel>
          <View style={styles.body}>
            <Toggle label={`Share my read with ${first} by default`} value={settings.shareDefault} onChange={(shareDefault) => void setSettings({ shareDefault })} />
            <Toggle
              label="Track your cycle (optional, private)"
              value={settings.cycleTracking}
              onChange={(cycleTracking) => {
                void setSettings({ cycleTracking });
                // Cycle data from the health app is only asked for now, never at the first connect.
                if (cycleTracking) void useHealthImports.getState().requestCycleAccess();
              }}
            />
          </View>

          <SectionLabel>{`What ${first} sees`}</SectionLabel>
          <View style={[styles.body, { gap: space[2] }]}>
            <Text variant="callout">
              When you share, {first} sees the read: the headline (for example “Train as planned, and keep an eye on it”), the reasons behind it in plain words, any note you add, and the time you checked in.
            </Text>
            <Text variant="callout">
              {first} doesn’t see your cycle phase unless you turn on “Share cycle phase” that day. It’s off every time.
            </Text>
            <Text variant="callout">When you keep a day private, {first} only sees that you checked in.</Text>
            <Text variant="callout">If you pick the easier or recovery version of a session, {first} sees which one in your history.</Text>
            <Text variant="caption" color="ink2">
              The read is a guide, not medical advice. It never changes your program by itself: you always choose.
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.toggle, { minHeight: touchMin }]}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: colors.brand, false: colors.line }} thumbColor={colors.surface} {...{ activeThumbColor: colors.surface }} />
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1], paddingBottom: space[2] },
  body: { paddingHorizontal: margin, paddingVertical: space[2], gap: space[3] },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
