import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Button, Text, margin, space, Screen } from '@spotter/ui';
import { tenant } from '../../src/env';
import { todayPlan, useApp } from '../../src/store';

/** Notification permission, asked after the waiver with a reason first (C-2). Then straight into the first workout. */
export default function NotificationsAsk() {
  const setAsked = useApp((s) => s.setNotificationsAsked);
  const startSession = useApp((s) => s.startSession);
  const mode = useApp((s) => s.demo.todayMode);
  const [busy, setBusy] = useState(false);
  const first = tenant.coach.name.split(' ')[0];

  const next = async (ask: boolean) => {
    setBusy(true);
    if (ask && Platform.OS !== 'web') {
      try {
        await Notifications.requestPermissionsAsync();
      } catch {
        // Denied or unavailable: the app works without it; Me → Notifications explains how to turn it on.
      }
    }
    setAsked();
    const plan = todayPlan(mode);
    if (plan) {
      const id = await startSession(plan);
      router.replace('/today');
      router.push(`/session/${id}`);
    } else {
      router.replace('/today');
    }
  };

  return (
    <Screen
      footer={
        <>
          <Button label="Turn on notifications" onPress={() => void next(true)} loading={busy} />
          <Button label="Not now" kind="quiet" onPress={() => void next(false)} disabled={busy} />
        </>
      }
    >
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Hear from {first}
        </Text>
        <Text>We’ll let you know when {first} replies, when your rest time is up, and the morning a check-in is due. Nothing else.</Text>
        <Text color="ink2">You can change this any time in Me → Notifications.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: margin, paddingTop: space[12], gap: space[4] },
});
