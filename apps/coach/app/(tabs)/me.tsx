import { Linking } from 'react-native';
import { router } from 'expo-router';
import { PARQ_QUESTIONS } from '@spotter/core';
import { ListRow, Monogram, Screen, ScreenHeader, SectionLabel, Text, margin, space } from '@spotter/ui';
import { CLIENT_URL, tenant } from '../../src/env';
import { useIntakeEditor } from '../../src/intakeForm';
import { MeRows } from '../../src/MeRows';

export default function Me() {
  const saved = useIntakeEditor((s) => s.saved);
  return (
    <Screen>
      <ScreenHeader title="Me" />
      <ListRow left={<Monogram initials={tenant.coach.monogram} size={40} />} title={tenant.coach.name} subtitle={`Owner · ${tenant.appName}`} />
      <ListRow title="Brand" subtitle={`${tenant.appName} · accent ${tenant.brandColor} · ${tenant.units}`} />
      <ListRow title="Client app" subtitle="Not published yet. Clients can use the shared Spotter app with your code in the meantime." />
      <SectionLabel>Onboarding</SectionLabel>
      <ListRow
        title="Intake form"
        subtitle={`${saved.questions.length} of your questions + ${PARQ_QUESTIONS.length} health questions`}
        chevron
        last
        onPress={() => router.push('/intake-form')}
      />
      <MeRows />
      <SectionLabel>Demo</SectionLabel>
      <ListRow title="Switch to client view" chevron last onPress={() => void Linking.openURL(CLIENT_URL)} />
      <Text variant="caption" color="ink2" style={{ padding: margin, paddingTop: space[3] }}>
        Spotter Coach · demo build with sample clients
      </Text>
    </Screen>
  );
}
