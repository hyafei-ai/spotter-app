import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Button, Screen, Text } from '@spotter/ui';
import { SignInScreen, takeReturnTo, useAuth } from '@spotter/ui/platform';
import { View } from 'react-native';
import { tenant } from '../../src/env';
import { acceptPendingInvite } from '../../src/platform/onboarding';
import { pull } from '../../src/platform/pull';

/**
 * Client sign-in (C-1). Once signed in: joins the coach from a saved invite, pulls the client's data,
 * then returns to where they were before their session expired (or starts onboarding).
 */
export default function ClientSignIn() {
  const { email, expired } = useLocalSearchParams<{ email?: string; expired?: string }>();
  const auth = useAuth();
  const [joinError, setJoinError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const first = tenant.coach.name.split(' ')[0];

  useEffect(() => {
    if (auth.status !== 'signedIn') return;
    let cancelled = false;
    void (async () => {
      try {
        await acceptPendingInvite();
        await pull().catch(() => {}); // offline is fine: the app works from cache and pulls later
        const back = await takeReturnTo();
        if (!cancelled) router.replace(back ?? '/');
      } catch (e) {
        if (!cancelled) setJoinError(e instanceof Error ? e.message : 'Couldn’t join. Try again.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.status, attempt]);

  if (joinError) {
    return (
      <Screen banner={<Banner tone="error" message={joinError} />} footer={<Button label="Try again" onPress={() => { setJoinError(null); setAttempt((n) => n + 1); }} />}>
        <View style={{ padding: 20, paddingTop: 48, gap: 12 }}>
          <Text variant="title" accessibilityRole="header">
            You’re signed in, but couldn’t join {first}’s app yet
          </Text>
          <Text color="ink2">If your invite expired, ask {first} for a new link.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <SignInScreen
      title={expired ? 'Sign in again' : `Sign in to ${tenant.appName}`}
      intro="We’ll email you a link. No password to remember."
      initialEmail={email}
      expired={!!expired}
      returnPath="/sign-in"
    />
  );
}
