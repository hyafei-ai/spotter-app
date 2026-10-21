import { useState } from 'react';
import { ActivityIndicator, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { ListRow, SectionLabel, useTheme, useToast } from '@spotter/ui';
import { isConfigured, signOut, useAuth } from '@spotter/ui/platform';
import { deleteAccount, exportMyData } from './account';

function confirm(title: string, message: string, action: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: onYes },
  ]);
}

/** Me rows for notifications, data export, account deletion and sign-out (C-10, K-9). */
export function AccountRows() {
  const toast = useToast();
  const { colors } = useTheme();
  const auth = useAuth();
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);

  const doExport = async () => {
    setBusy('export');
    try {
      const r = await exportMyData();
      toast({ message: r.emailed ? 'Export ready. We’ve emailed you a download link.' : isConfigured() ? 'Export ready.' : 'Export saved.' });
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Export didn’t work. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  const doDelete = () =>
    confirm(
      'Delete your account?',
      isConfigured()
        ? 'This deletes your training log, messages and check-ins, and you’ll lose access to your coach’s app. Your signed waiver is kept where the law requires it. This can’t be undone.'
        : 'Demo build: this clears the data on this phone and starts over.',
      'Delete account',
      () => {
        setBusy('delete');
        deleteAccount()
          .then(() => router.replace('/'))
          .catch((e: Error) => {
            setBusy(null);
            toast({ message: e.message });
          });
      },
    );

  const spinner = <ActivityIndicator color={colors.ink2} />;
  return (
    <>
      <SectionLabel>Account</SectionLabel>
      <ListRow title="Notifications" subtitle="Coach replies, rest timer, check-in reminders, quiet hours" chevron onPress={() => router.push('/settings/notifications')} />
      <ListRow
        title="Export my data"
        subtitle="Your sessions, messages and answers as CSV and JSON"
        right={busy === 'export' ? spinner : undefined}
        chevron={busy !== 'export'}
        onPress={busy ? undefined : () => void doExport()}
      />
      <ListRow
        title="Delete account"
        subtitle="Removes your training data. Your signed waiver may be kept where the law requires it."
        right={busy === 'delete' ? spinner : undefined}
        onPress={busy ? undefined : doDelete}
        last={auth.status !== 'signedIn'}
      />
      {auth.status === 'signedIn' ? (
        <ListRow title="Sign out" subtitle={auth.email ?? undefined} last onPress={() => void signOut().then(() => router.replace('/'))} />
      ) : null}
    </>
  );
}
