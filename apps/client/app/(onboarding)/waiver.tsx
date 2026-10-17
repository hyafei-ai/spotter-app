import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Text, TextField, useTheme, margin, space, radius, Screen } from '@spotter/ui';
import { SignaturePad } from '../../src/SignaturePad';
import { SyncBanner } from '../../src/SyncBanner';
import { tenant } from '../../src/env';
import { useApp } from '../../src/store';
import { useSync } from '../../src/sync';

/*
 * MOCK DATA — sample waiver text for the demo tenant. Each trainer supplies their own
 * (waivers table, versioned). This is not legal advice or a recommended template.
 */
const SAMPLE_WAIVER = (business: string) => `${business}: Assumption of risk and release (sample text)

Strength training involves physical exertion and a risk of injury. I confirm that I have told my coach about any medical conditions or injuries, and that I will stop and seek advice if I feel pain, dizziness or chest discomfort.

I take part voluntarily and accept responsibility for following the program safely, using equipment correctly and training within my limits.

I understand my coach is not a medical provider and that this coaching is not medical advice.`;

export default function Waiver() {
  const { colors } = useTheme();
  const signWaiver = useApp((s) => s.signWaiver);
  const online = useSync((s) => s.online);
  const [name, setName] = useState('');
  const [svg, setSvg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [signedOffline, setSignedOffline] = useState(false);

  const missing = [!name.trim() && 'type your name', !svg && 'sign in the box'].filter(Boolean).join(' and ');

  const sign = async () => {
    setSaving(true);
    await signWaiver(name.trim(), svg!);
    setSaving(false);
    if (!online) {
      setSignedOffline(true);
      return;
    }
    router.replace('/notifications');
  };

  if (signedOffline) {
    return (
      <Screen banner={<SyncBanner />} footer={<Button label="Continue" onPress={() => router.replace('/notifications')} />}>
        <View style={styles.head}>
          <Text variant="title" accessibilityRole="header">
            Signed and saved on your phone
          </Text>
          <Text color="ink2">
            It uploads when you’re back online. A PDF copy is emailed to you and {tenant.coach.name.split(' ')[0]} once it does.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      banner={<SyncBanner />}
      footer={
        <Button
          label="Sign waiver"
          onPress={sign}
          loading={saving}
          disabled={!!missing}
          disabledReason={missing ? `To continue, ${missing}.` : undefined}
        />
      }
    >
      <View style={styles.head}>
        <Text variant="label" color="ink2">
          Step 2 of 2
        </Text>
        <Text variant="title" accessibilityRole="header">
          Liability waiver
        </Text>
        <Text color="ink2">Read it through, then sign. You’ll get a PDF copy by email.</Text>
      </View>
      <View style={[styles.doc, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Text variant="callout">{SAMPLE_WAIVER(tenant.appName)}</Text>
      </View>
      <View style={styles.form}>
        <TextField
          label="Your full name"
          value={name}
          onChangeText={setName}
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          returnKeyType="done"
        />
        <SignaturePad onChange={setSvg} />
        <Text variant="caption" color="ink2">
          We store your typed name, signature, the time and the app version with the signed copy.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: margin, paddingTop: space[6], gap: space[2] },
  doc: { marginHorizontal: margin, marginTop: space[5], padding: space[4], borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.control },
  form: { paddingHorizontal: margin, paddingTop: space[5], gap: space[5] },
});
