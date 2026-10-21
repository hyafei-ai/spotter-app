import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Switch, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NotificationSettings,
  formatClock,
  type NotificationCategory,
} from '@spotter/core';
import { useTheme } from '../theme';
import { margin, space } from '../tokens';
import { Banner } from '../components/Banner';
import { IconButton, SectionLabel, Skeleton } from '../components/Basics';
import { Screen } from '../components/Screen';
import { Stepper } from '../components/Stepper';
import { Text } from '../components/Text';
import { secureStorage } from './secureStorage';
import { supabase } from './supabase';

const KEY = 'spotter.notificationSettings';
const localZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** Reads settings from the server when signed in, else from this device (demo). */
export async function loadNotificationSettings(tenantId: string): Promise<NotificationSettings> {
  const fallback = { ...DEFAULT_NOTIFICATION_SETTINGS, timezone: localZone() };
  if (supabase) {
    const { data: s } = await supabase.auth.getSession();
    const uid = s.session?.user.id;
    if (uid) {
      const { data, error } = await supabase.from('notification_settings').select('settings').eq('tenant_id', tenantId).eq('profile_id', uid).maybeSingle();
      if (error) throw new Error('Couldn’t load your settings. Check your connection.');
      const parsed = NotificationSettings.safeParse(data?.settings);
      return parsed.success ? parsed.data : fallback;
    }
  }
  const raw = await secureStorage.getItem(KEY);
  const parsed = raw ? NotificationSettings.safeParse(JSON.parse(raw)) : null;
  return parsed?.success ? parsed.data : fallback;
}

export async function saveNotificationSettings(tenantId: string, s: NotificationSettings): Promise<void> {
  if (supabase) {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (uid) {
      const { error } = await supabase.from('notification_settings').upsert({ tenant_id: tenantId, profile_id: uid, settings: s });
      if (error) throw new Error('Couldn’t save. Check your connection and try again.');
      return;
    }
  }
  await secureStorage.setItem(KEY, JSON.stringify(s));
}

/** Notification settings (C-10, K-1): per-category switches and quiet hours. */
export function NotificationSettingsScreen({
  tenantId,
  categories,
  onBack,
}: {
  tenantId: string;
  categories: { category: NotificationCategory; label: string; detail: string }[];
  onBack: () => void;
}) {
  const { colors } = useTheme();
  const [s, setS] = useState<NotificationSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [osDenied, setOsDenied] = useState(false);

  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    setError(null);
    setAttempt((n) => n + 1);
  };
  useEffect(() => {
    loadNotificationSettings(tenantId)
      .then(setS)
      .catch((e: Error) => setError(e.message));
    if (Platform.OS !== 'web') void Notifications.getPermissionsAsync().then((p) => setOsDenied(p.status === 'denied'));
  }, [tenantId, attempt]);

  const update = (next: NotificationSettings) => {
    setS(next);
    setSaved(false);
    saveNotificationSettings(tenantId, { ...next, timezone: localZone() })
      .then(() => setSaved(true))
      .catch((e: Error) => setError(e.message));
  };

  const quietOn = s?.quietStart != null && s?.quietEnd != null;
  return (
    <Screen
      banner={
        error ? (
          <Banner tone="error" message={error} actionLabel={s ? undefined : 'Retry'} onAction={s ? undefined : retry} />
        ) : osDenied ? (
          <Banner tone="warning" message="Notifications are off for this app in your phone’s Settings." actionLabel="Open Settings" onAction={() => void Linking.openSettings()} />
        ) : undefined
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={onBack} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Notifications
        </Text>
        <Text color="ink2" accessibilityLiveRegion="polite">
          {saved ? 'Saved.' : 'Choose what’s worth interrupting you for.'}
        </Text>
      </View>
      {!s ? (
        <View style={[styles.body, { gap: space[3] }]}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={44} />
          ))}
        </View>
      ) : (
        <>
          <SectionLabel>Send me</SectionLabel>
          {categories.map((c) => (
            <View key={c.category} style={[styles.toggle, { borderBottomColor: colors.line }]}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{c.label}</Text>
                <Text variant="callout" color="ink2">
                  {c.detail}
                </Text>
              </View>
              <Switch
                accessibilityLabel={c.label}
                value={s.enabled[c.category] !== false}
                onValueChange={(v) => update({ ...s, enabled: { ...s.enabled, [c.category]: v } })}
                trackColor={{ true: colors.brand, false: colors.line }}
                thumbColor={colors.surface}
                {...{ activeThumbColor: colors.surface }}
              />
            </View>
          ))}
          <SectionLabel>Quiet hours</SectionLabel>
          <View style={[styles.toggle, { borderBottomColor: colors.line }]}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Hold notifications overnight</Text>
              <Text variant="callout" color="ink2">
                They arrive when quiet hours end. Rest-timer alerts still come through.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Quiet hours"
              value={quietOn}
              onValueChange={(v) => update(v ? { ...s, quietStart: 22 * 60, quietEnd: 7 * 60 } : { ...s, quietStart: null, quietEnd: null })}
              trackColor={{ true: colors.brand, false: colors.line }}
              thumbColor={colors.surface}
              {...{ activeThumbColor: colors.surface }}
            />
          </View>
          {quietOn ? (
            <View style={[styles.body, styles.steppers]}>
              <Stepper label="From" value={s.quietStart!} step={30} min={0} max={1410} format={formatClock} onChange={(quietStart) => update({ ...s, quietStart })} />
              <Stepper label="Until" value={s.quietEnd!} step={30} min={0} max={1410} format={formatClock} onChange={(quietEnd) => update({ ...s, quietEnd })} />
            </View>
          ) : null}
          <Text variant="caption" color="ink2" style={styles.body}>
            Times are in your phone’s time zone ({localZone()}).
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  body: { paddingHorizontal: margin, paddingTop: space[3] },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: margin, paddingVertical: space[3], minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  steppers: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
});
