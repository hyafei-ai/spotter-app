import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { parseInvite, type InviteParams } from '@spotter/core';
import { Button, Monogram, Screen, Text, useTheme, margin, space } from '@spotter/ui';
import { Checkbox, isConfigured } from '@spotter/ui/platform';
import { DEMO_CLIENT } from '@spotter/core/demo';
import { tenant } from '../../src/env';
import { TrainerCode } from '../../src/TrainerCode';
import { useRuntimeTenant } from '../../src/runtimeTenant';
import { hasConsent, loadInvite, recordConsent, saveInvite } from '../../src/platform/onboarding';

/**
 * C-1/C-2 welcome. An invite link (/join?t=…&tenant=…&e=…) pre-fills the tenant and email.
 * `?invite=expired` (or an invite for another trainer's app) shows the invalid-invite state.
 * Consent to the privacy policy is asked here, once, before anything is stored on the server.
 */
export default function Welcome() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<Record<string, string>>();
  const needsCode = useRuntimeTenant((s) => s.needsCode);
  const coach = tenant.coach;
  const firstName = coach.name.split(' ')[0];
  const fromLink = parseInvite(params);
  const [invite, setInvite] = useState<InviteParams | null>(fromLink);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (fromLink) void saveInvite(fromLink);
    else void loadInvite().then((i) => i && setInvite(i));
    void hasConsent().then((c) => c && setAgreed(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.t]);

  // Shared Spotter app: pick the trainer first (W-3).
  if (needsCode) return <TrainerCode initialCode={params.code} />;

  const wrongApp = invite && invite.tenant !== tenant.slug;
  if (params.invite === 'expired' || params.invite === 'invalid' || wrongApp) {
    return (
      <Screen
        footer={
          <Button label={`Email ${firstName}`} icon="mail" onPress={() => void Linking.openURL(`mailto:${tenant.supportEmail}?subject=New invite link`)} />
        }
      >
        <View style={styles.top}>
          <Monogram initials={coach.monogram} size={64} label={coach.name} />
          <Text variant="title" accessibilityRole="header">
            {wrongApp ? 'This invite is for another coach’s app' : 'This invite has expired'}
          </Text>
          <Text color="ink2">
            {wrongApp
              ? `Open the link in the app your coach sent you, or ask ${firstName} for a link to this one.`
              : `Invite links last 14 days. Ask ${firstName} for a new one and open it on this phone.`}
          </Text>
        </View>
      </Screen>
    );
  }

  const email = invite?.email ?? (isConfigured() ? null : DEMO_CLIENT.email);
  const start = async () => {
    setBusy(true);
    if (!(await hasConsent())) await recordConsent();
    setBusy(false);
    if (isConfigured()) router.push(email ? `/sign-in?email=${encodeURIComponent(email)}` : '/sign-in');
    else router.push('/intake');
  };

  return (
    <Screen
      footer={
        <Button label="Get started" onPress={() => void start()} loading={busy} disabled={!agreed} disabledReason="Tick the box above to continue." />
      }
    >
      <View style={styles.top}>
        <Monogram initials={coach.monogram} size={72} label={coach.name} />
        <View>
          <Text variant="label" color="ink2">
            Coached by
          </Text>
          <Text variant="title" accessibilityRole="header">
            {coach.name}
          </Text>
        </View>
        <View style={[styles.note, { borderLeftColor: colors.brand }]}>
          <Text variant="body">{coach.welcomeMessage}</Text>
        </View>
        {email ? (
          <Text variant="caption" color="ink2">
            Joining as {email}
          </Text>
        ) : null}
        <Checkbox
          checked={agreed}
          onChange={setAgreed}
          label={`I agree to the privacy policy, and to ${firstName} seeing my training, check-ins and health answers.`}
        />
        {/* The policy link sits outside the checkbox so the two controls aren't nested. */}
        <Text
          variant="callout"
          style={{ color: colors.brand, textDecorationLine: 'underline', marginLeft: 36, marginTop: -space[2] }}
          onPress={() => void Linking.openURL(tenant.privacyPolicyUrl)}
          accessibilityRole="link"
        >
          Read the privacy policy
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: margin, paddingTop: space[12], gap: space[5] },
  note: { borderLeftWidth: 3, paddingLeft: space[4], paddingVertical: space[1] },
});
