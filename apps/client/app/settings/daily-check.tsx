import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { IconButton, Screen, SectionLabel, SegmentedControl, Skeleton, Text, useTheme, margin, space, touchMin } from '@spotter/ui';
import { tenant } from '../../src/env';
import { useDaily } from '../../src/daily/store';
import { WhoSeesLink } from '../../src/sharing/WhoSeesLink';
import { hourLabel } from '../../src/daily/DailyCheckRow';

const HOURS = [6, 7, 8, 9].map((h) => ({ value: String(h), label: hourLabel(h) }));

/** Me → Daily check. Reminder and default sharing. Cycle on/off lives in Your cycle; the full list in Who sees what. */
export default function DailyCheckSettings() {
  const { colors } = useTheme();
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
          </View>

          <View style={[styles.body, { gap: space[2] }]}>
            <Text variant="callout">
              {`When you share, ${first} sees the headline and the reasons in plain words, any note you add, and the time you checked in. Kept private, ${first} only sees that you checked in.`}
            </Text>
            <WhoSeesLink label="Everything else: Who sees what" />
          </View>

          <SectionLabel>Cycle</SectionLabel>
          <View style={[styles.body, { gap: space[2] }]}>
            <Text variant="callout">Cycle tracking is set up in one place, Your cycle, including whether {first} sees your phase.</Text>
            <Pressable onPress={() => router.push('/cycle')} accessibilityRole="link" hitSlop={8} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
              <Text variant="bodyStrong" style={{ color: colors.brand }}>
                Open Your cycle
              </Text>
            </Pressable>
          </View>

          <View style={[styles.body, { gap: space[2] }]}>
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
