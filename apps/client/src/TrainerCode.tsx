import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Monogram, Screen, Text, TextField, margin, space } from '@spotter/ui';
import { normalizeJoinCode } from '@spotter/core';
import { joinTrainer } from './runtimeTenant';
import { useSync } from './sync';
import { IS_DEMO } from './env';

/**
 * Shared Spotter app, before a trainer is chosen (W-3 fallback). Clients of a trainer whose own app is
 * still in store review use this app with the trainer's code; it then shows the trainer's branding.
 * Invite links can carry the code (?code=MAYA) so the client doesn't have to type it.
 */
export function TrainerCode({ initialCode }: { initialCode?: string }) {
  const online = useSync((s) => s.online);
  const [code, setCode] = useState(initialCode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = normalizeJoinCode(code);

  const submit = async (value = code) => {
    setBusy(true);
    setError(null);
    try {
      const t = await joinTrainer(value);
      if (!t) setError('That code didn’t match a trainer. Check it with your trainer and try again.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // An invite link with a code joins straight away; only an unknown code needs the form.
  useEffect(() => {
    if (!initialCode) return;
    joinTrainer(initialCode)
      .then((t) => {
        if (!t) setError('The code in your invite didn’t match a trainer. Check it with your trainer.');
      })
      .catch((e: Error) => setError(e.message));
  }, [initialCode]);

  return (
    <Screen
      footer={
        <Button
          label="Continue"
          onPress={() => void submit()}
          loading={busy}
          disabled={clean.length < 4 || !online}
          disabledReason={!online ? 'You’re offline. Connect to look up your trainer.' : clean.length < 4 ? 'Codes are at least 4 letters or numbers.' : undefined}
        />
      }
    >
      <View style={styles.top}>
        <Monogram initials="S" size={64} label="Spotter" />
        <Text variant="title" accessibilityRole="header">
          Enter your trainer’s code
        </Text>
        <Text color="ink2">Your trainer gave you a short code with your invite. It loads their program and their app’s look.</Text>
        <TextField
          label="Trainer code"
          value={code}
          onChangeText={(t) => {
            setCode(t);
            setError(null);
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="go"
          onSubmitEditing={() => clean.length >= 4 && void submit()}
          error={error ?? undefined}
          hint={IS_DEMO ? 'Demo codes: MAYA or NSB2026' : undefined}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: margin, paddingTop: space[12], gap: space[4] },
});
