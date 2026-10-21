import { Linking, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Monogram, Text, useTheme, margin, space, Screen } from '@spotter/ui';
import { DEMO_CLIENT } from '@spotter/core/demo';
import { tenant } from '../../src/env';
import { TrainerCode } from '../../src/TrainerCode';
import { useRuntimeTenant } from '../../src/runtimeTenant';

/** C-1/C-2 welcome. The invite link pre-fills tenant and email; `?invite=expired` shows the invalid-invite state. */
export default function Welcome() {
  const { colors } = useTheme();
  const { invite, code } = useLocalSearchParams<{ invite?: string; code?: string }>();
  const needsCode = useRuntimeTenant((s) => s.needsCode);
  const coach = tenant.coach;
  const firstName = coach.name.split(' ')[0];

  // Shared Spotter app: pick the trainer first (W-3).
  if (needsCode) return <TrainerCode initialCode={code} />;

  if (invite === 'expired' || invite === 'invalid') {
    return (
      <Screen
        footer={
          <Button
            label={`Email ${firstName}`}
            icon="mail"
            onPress={() => void Linking.openURL(`mailto:${tenant.supportEmail}?subject=New invite link`)}
          />
        }
      >
        <View style={styles.top}>
          <Monogram initials={coach.monogram} size={64} label={coach.name} />
          <Text variant="title" accessibilityRole="header">
            This invite has expired
          </Text>
          <Text color="ink2">Invite links last 14 days. Ask {firstName} for a new one and open it on this phone.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen footer={<Button label="Get started" onPress={() => router.push('/intake')} />}>
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
        <Text variant="caption" color="ink2">
          Joining as {DEMO_CLIENT.email}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: margin, paddingTop: space[12], gap: space[5] },
  note: { borderLeftWidth: 3, paddingLeft: space[4], paddingVertical: space[1] },
});
