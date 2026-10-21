import { useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useTheme } from '../theme';
import { margin, space } from '../tokens';
import { Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { Screen } from '../components/Screen';
import { Text } from '../components/Text';
import { TextField } from '../components/Basics';
import {
  GOOGLE_CLIENT_IDS,
  appleAvailable,
  googleAvailable,
  sendMagicLink,
  signInWithApple,
  signInWithGoogleIdToken,
  signInWithGoogleRedirect,
} from './signIn';

WebBrowser.maybeCompleteAuthSession();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/network|fetch|connection/i.test(m)) return 'Couldn’t reach the server. Check your connection and try again.';
  if (/canceled|cancelled/i.test(m)) return '';
  return m;
}

/**
 * Sign-in for both apps (C-1). Email magic link first (no password to forget at the gym),
 * then Apple (iOS) and Google. `children` renders above the buttons, e.g. a consent checkbox;
 * `blockedReason` disables every method until it's resolved.
 */
export function SignInScreen({
  title,
  intro,
  initialEmail,
  expired,
  blockedReason,
  returnPath = '/',
  children,
}: {
  title: string;
  intro: string;
  initialEmail?: string;
  expired?: boolean;
  blockedReason?: string;
  returnPath?: string;
  children?: ReactNode;
}) {
  const [email, setEmail] = useState(initialEmail ?? '');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [apple, setApple] = useState(false);
  const { scheme } = useTheme();

  useEffect(() => {
    void appleAvailable().then(setApple);
  }, []);

  const valid = EMAIL_RE.test(email.trim());
  const send = async () => {
    setError(null);
    setState('sending');
    try {
      await sendMagicLink(email);
      setState('sent');
    } catch (e) {
      setError(friendly(e));
      setState('idle');
    }
  };
  const run = (fn: () => Promise<void>) => async () => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      const m = friendly(e);
      if (m) setError(m);
    }
  };

  if (state === 'sent') {
    return (
      <Screen
        footer={
          <>
            <Button label="Send the link again" kind="secondary" onPress={() => void send()} />
            <Button label="Use a different email" kind="quiet" onPress={() => setState('idle')} />
          </>
        }
      >
        <View style={styles.head}>
          <Text variant="title" accessibilityRole="header">
            Check your email
          </Text>
          <Text>
            We sent a sign-in link to <Text variant="bodyStrong">{email.trim()}</Text>. Open it on this phone and you’ll come straight back here.
          </Text>
          <Text color="ink2">It can take a minute. Check spam if it doesn’t arrive.</Text>
        </View>
      </Screen>
    );
  }

  const blocked = !!blockedReason;
  return (
    <Screen
      banner={
        expired ? <Banner tone="warning" message="Your session ended. Sign in again and you’ll be back where you were." /> : error ? <Banner tone="error" message={error} /> : undefined
      }
      footer={
        <>
          <Button
            label="Email me a sign-in link"
            icon="mail"
            onPress={() => void send()}
            loading={state === 'sending'}
            disabled={blocked || !valid}
            disabledReason={blockedReason ?? (email ? 'Enter a full email address.' : 'Enter your email address.')}
          />
          {apple ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={scheme === 'dark' ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={6}
              style={[styles.apple, blocked && { opacity: 0.45 }]}
              onPress={blocked ? () => {} : run(signInWithApple)}
            />
          ) : null}
          {googleAvailable() ? (
            Platform.OS === 'web' ? (
              <Button label="Continue with Google" kind="secondary" disabled={blocked} onPress={run(() => signInWithGoogleRedirect(returnPath))} />
            ) : (
              <GoogleNative disabled={blocked} onError={setError} />
            )
          ) : null}
        </>
      }
    >
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        <Text color="ink2">{intro}</Text>
      </View>
      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          onSubmitEditing={() => valid && !blocked && void send()}
        />
        {children}
      </View>
    </Screen>
  );
}

/** Separate component so the Google hook only runs when client IDs are configured. */
function GoogleNative({ disabled, onError }: { disabled: boolean; onError: (m: string) => void }) {
  const [request, response, prompt] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_IDS.web,
    iosClientId: GOOGLE_CLIENT_IDS.ios,
    androidClientId: GOOGLE_CLIENT_IDS.android,
  });
  useEffect(() => {
    if (response?.type === 'success' && response.params.id_token) {
      signInWithGoogleIdToken(response.params.id_token).catch((e) => onError(friendly(e)));
    } else if (response?.type === 'error') {
      onError('Google sign-in didn’t finish. Try again or use the email link.');
    }
  }, [response, onError]);
  return <Button label="Continue with Google" kind="secondary" disabled={disabled || !request} onPress={() => void prompt()} />;
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: margin, paddingTop: space[10], gap: space[3] },
  form: { paddingHorizontal: margin, paddingTop: space[6], gap: space[4] },
  apple: { height: 52, width: '100%' },
});
