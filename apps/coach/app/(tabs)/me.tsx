import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { PARQ_QUESTIONS } from '@spotter/core';
import { ListRow, Monogram, Screen, ScreenHeader, SectionLabel, SegmentedControl, Text, margin, space } from '@spotter/ui';
import { isConfigured } from '@spotter/ui/platform';
import { CLIENT_URL, tenant } from '../../src/env';
import { useIntakeEditor } from '../../src/intakeForm';
import { MeRows } from '../../src/MeRows';
import { DEMO_TEAM_IDS, useRole, useTeam } from '../../src/platform/team';
import { initials } from '../../src/store';

export default function Me() {
  const saved = useIntakeEditor((s) => s.saved);
  const { isOwner, viewer } = useRole();
  const setViewer = useTeam((s) => s.setViewer);
  const name = viewer?.name ?? tenant.coach.name;
  return (
    <Screen>
      <ScreenHeader title="Me" />
      <ListRow
        left={<Monogram initials={isOwner ? tenant.coach.monogram : initials(name)} size={40} />}
        title={name}
        subtitle={`${isOwner ? 'Owner' : 'Assistant coach'} · ${tenant.appName}`}
      />
      {/* Branding and publishing are owner-only, hidden for assistants (UX finding M1). */}
      {isOwner ? (
        <>
          <ListRow title="Brand" subtitle={`${tenant.appName} · accent ${tenant.brandColor} · ${tenant.units}`} />
          <ListRow title="Client app" subtitle="Not published yet. Clients can use the shared Spotter app with your code in the meantime." />
        </>
      ) : null}
      <SectionLabel>Onboarding</SectionLabel>
      <ListRow
        title="Intake form"
        subtitle={`${saved.questions.length} of your questions + ${PARQ_QUESTIONS.length} health questions`}
        chevron
        last
        onPress={() => router.push('/intake-form')}
      />
      <MeRows />
      {!isConfigured() ? (
        <>
          <SectionLabel>Demo</SectionLabel>
          <View style={{ paddingHorizontal: margin, paddingVertical: space[3], gap: space[2] }}>
            <Text variant="label" color="ink2">
              View the app as
            </Text>
            <SegmentedControl
              label="View the app as"
              value={isOwner ? 'owner' : 'assistant'}
              onChange={(v) => setViewer(v === 'owner' ? DEMO_TEAM_IDS.OWNER_ID : DEMO_TEAM_IDS.ASSISTANT_ID)}
              options={[
                { value: 'owner', label: 'Owner' },
                { value: 'assistant', label: 'Assistant coach' },
              ]}
            />
          </View>
          <ListRow title="Switch to client view" chevron last onPress={() => void Linking.openURL(CLIENT_URL)} />
          <Text variant="caption" color="ink2" style={{ padding: margin, paddingTop: space[3] }}>
            Spotter Coach · demo build with sample clients
          </Text>
        </>
      ) : null}
    </Screen>
  );
}
