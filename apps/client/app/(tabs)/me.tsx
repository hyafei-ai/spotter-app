import { Alert, Linking, Platform, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { Banner, ListRow, Screen, ScreenHeader, SectionLabel, SegmentedControl, Text, useTheme, margin, space } from '@spotter/ui';
import { DEMO_CLIENT } from '@spotter/core/demo';
import { COACH_URL, IS_DEMO, tenant } from '../../src/env';
import { setDemoOffline } from '../../src/sync';
import { useApp, type TodayMode } from '../../src/store';
import { AccountRows, ME_CONNECTION_ROWS, ME_PLAN_ROWS, MeRows } from '../../src/MeRows';

/** C-10 Me. Demo builds add demo controls and "Switch to coach view". */
export default function Me() {
  const { demo, setDemo, waiver, resetDemo } = useApp();

  const confirm = (title: string, message: string, onYes: () => void) => {
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`${title}\n\n${message}`)) onYes();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: title, style: 'destructive', onPress: onYes },
    ]);
  };

  return (
    <Screen
      banner={
        demo.billingProblem ? (
          <Banner tone="error" message="Your last payment didn’t go through. Update your card on the billing page to keep coaching active." />
        ) : undefined
      }
    >
      <ScreenHeader title="Me" subtitle="Your account. How your body is doing lives on Body." />
      <ListRow title={DEMO_CLIENT.name} subtitle={`${DEMO_CLIENT.email} · ${tenant.units === 'kg' ? 'kilograms' : 'pounds'} (set by your coach)`} />

      <SectionLabel>Plan</SectionLabel>
      <MeRows rows={ME_PLAN_ROWS} />

      <SectionLabel>Connections and reminders</SectionLabel>
      <MeRows rows={ME_CONNECTION_ROWS} />

      <SectionLabel>Privacy</SectionLabel>
      <ListRow title="Who sees what" subtitle={`What ${tenant.coach.name.split(' ')[0]} can and can’t see, with a switch for each`} chevron onPress={() => router.push('/sharing')} />
      <ListRow
        title="Signed waiver"
        subtitle={waiver ? `Signed by ${waiver.signedName}, ${new Date(waiver.signedAt).toLocaleDateString()}` : 'Not signed yet'}
      />
      <ListRow title="Privacy policy" chevron last onPress={() => void Linking.openURL(tenant.privacyPolicyUrl)} />

      {/* Notifications, Export my data, Delete account and Sign out. */}
      <AccountRows />

      {IS_DEMO ? (
        <>
          <SectionLabel>Demo controls</SectionLabel>
          <View style={styles.demo}>
            <Text variant="callout" color="ink2">
              This preview runs on sample data, with no server. These controls show the screen states.
            </Text>
            <Text variant="label" color="ink2">
              Today shows
            </Text>
            <SegmentedControl<TodayMode>
              label="Today shows"
              value={demo.todayMode}
              onChange={(todayMode) => setDemo({ todayMode })}
              options={[
                { value: 'session', label: 'Session' },
                { value: 'rest', label: 'Rest day' },
                { value: 'none', label: 'No program' },
              ]}
            />
            <ToggleRow
              label="Simulate no signal"
              value={demo.offline}
              onChange={(offline) => {
                setDemo({ offline });
                setDemoOffline(offline);
              }}
            />
            <ToggleRow label="Payment problem" value={demo.billingProblem} onChange={(billingProblem) => setDemo({ billingProblem })} />
          </View>
          <ListRow title="Switch to coach view" chevron onPress={() => void Linking.openURL(COACH_URL)} />
          <ListRow
            title="Start the demo over"
            subtitle="Back to the invite screen"
            last
            onPress={() => confirm('Start over', 'Clears the demo data on this device.', () => void resetDemo().then(() => router.replace('/')))}
          />
          <Text variant="caption" color="ink2" style={{ padding: margin }}>
            {tenant.appName} · Spotter demo build
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.toggle}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: colors.brand, false: colors.line }} thumbColor={colors.surface} {...{ activeThumbColor: colors.surface }} />
    </View>
  );
}

const styles = StyleSheet.create({
  demo: { paddingHorizontal: margin, paddingVertical: space[3], gap: space[3] },
  toggle: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
});
