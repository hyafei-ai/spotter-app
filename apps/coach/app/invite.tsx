import { useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import {
  Banner,
  Button,
  IconButton,
  Screen,
  Text,
  TextField,
  useToast,
  margin,
  space,
} from '@spotter/ui';
import { QrCode, isConfigured } from '@spotter/ui/platform';
import { tenant } from '../src/env';
import { createInvite } from '../src/platform/invite';
import { DEMO_JORDAN_ID, SAMPLE_CLIENT } from '@spotter/core/demo';
import { useFirstRunPreview } from '../src/today/data';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Invite a client (C-1): emails a link and shows a QR code for in-person sign-ups. */
export default function InviteClient() {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ url: string; emailed: boolean } | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/today'));
  const firstRun = useFirstRunPreview((s) => s.preview);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      setInvite(
        await createInvite({ email: email.trim(), name: name.trim() || undefined, role: 'client' }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t create the invite. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await Clipboard.setStringAsync(invite!.url);
    toast({ message: 'Link copied.' });
  };

  if (invite) {
    const first = name.trim().split(' ')[0] || 'They';
    return (
      <Screen
        footer={
          <>
            {Platform.OS !== 'web' ? (
              <Button
                label="Share link"
                icon="share"
                onPress={() => void Share.share({ message: invite.url })}
              />
            ) : null}
            <Button label="Copy link" icon="copy" kind="secondary" onPress={() => void copy()} />
            <Button
              label="Invite someone else"
              kind="quiet"
              onPress={() => {
                setInvite(null);
                setName('');
                setEmail('');
              }}
            />
          </>
        }
      >
        <View style={styles.nav}>
          <IconButton icon="arrow-left" label="Back to clients" onPress={back} />
        </View>
        <View style={styles.head}>
          <Text variant="title" accessibilityRole="header">
            Invite ready
          </Text>
          <Text color="ink2">
            {invite.emailed
              ? `We emailed ${email.trim()} a link. ${first} can also scan this code with their phone camera.`
              : isConfigured()
                ? `Email didn’t send. Share the link or let ${first.toLowerCase() === 'they' ? 'them' : first} scan this code.`
                : 'Demo: nothing was emailed. Scan the code or open the link to try the client sign-up.'}
          </Text>
        </View>
        <View style={styles.qr}>
          <QrCode value={invite.url} size={240} label={`QR code to join ${tenant.appName}`} />
        </View>
        <Text variant="caption" color="ink2" style={styles.body} selectable>
          {invite.url}
        </Text>
        <Text variant="caption" color="ink2" style={styles.body}>
          The link works for 14 days and only once.
        </Text>
        <View style={[styles.body, { paddingTop: space[6], gap: space[2] }]}>
          <Text variant="headline">What you’ll see next</Text>
          <Text variant="callout" color="ink2">
            {`When ${first.toLowerCase() === 'they' ? 'they connect' : `${first} connects`} Apple Health or Health Connect, the history their health app shares shows up on their page: workouts from any app, sleep, HRV, resting heart rate and food, and the cycle only if they choose to share it. How far back depends on what their phone has kept and allows. Patterns appear once there’s about 8 weeks of it.`}
          </Text>
          {!isConfigured() ? (
            <Button
              label="See a connected client (demo)"
              kind="quiet"
              full={false}
              icon="eye"
              onPress={() =>
                router.push(`/client/${firstRun ? SAMPLE_CLIENT.id : DEMO_JORDAN_ID}?connected=1`)
              }
            />
          ) : null}
        </View>
      </Screen>
    );
  }

  const problem = !EMAIL_RE.test(email.trim())
    ? email
      ? 'Enter a full email address.'
      : 'Enter their email address.'
    : undefined;
  return (
    <Screen
      banner={error ? <Banner tone="error" message={error} /> : undefined}
      footer={
        <Button
          label="Create invite"
          onPress={() => void create()}
          loading={busy}
          disabled={!!problem}
          disabledReason={problem}
        />
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back to clients" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Invite a client
        </Text>
        <Text color="ink2">
          They’ll get a link to {tenant.appName}, with their email filled in. You’ll see them on
          Clients once they join, with their history as soon as they connect their health app.
        </Text>
      </View>
      <View style={[styles.body, { gap: space[4], paddingTop: space[5] }]}>
        <TextField
          label="Name (optional)"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
        />
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2] },
  body: { paddingHorizontal: margin, paddingTop: space[2] },
  qr: { alignItems: 'center', paddingTop: space[6], paddingBottom: space[2] },
});
