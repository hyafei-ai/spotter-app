import { Linking } from 'react-native';
import { ListRow, Monogram, Screen, ScreenHeader, SectionLabel, Text, margin, space } from '@spotter/ui';
import { CLIENT_URL, tenant } from '../../src/env';

export default function Me() {
  return (
    <Screen>
      <ScreenHeader title="Me" />
      <ListRow left={<Monogram initials={tenant.coach.monogram} size={40} />} title={tenant.coach.name} subtitle={`Owner · ${tenant.appName}`} />
      <ListRow title="Brand" subtitle={`${tenant.appName} · accent ${tenant.brandColor} · ${tenant.units}`} />
      <ListRow title="Client app" subtitle="Not published yet. Clients can use the shared Spotter app with your code in the meantime." last />
      <SectionLabel>Demo</SectionLabel>
      <ListRow title="Switch to client view" chevron last onPress={() => void Linking.openURL(CLIENT_URL)} />
      <Text variant="caption" color="ink2" style={{ padding: margin, paddingTop: space[3] }}>
        Spotter Coach · demo build with sample clients
      </Text>
    </Screen>
  );
}
