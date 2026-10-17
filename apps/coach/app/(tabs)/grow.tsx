import { ListRow, Screen, ScreenHeader, SectionLabel, Tag, Text, margin, space } from '@spotter/ui';
import { View } from 'react-native';

/** K-6 Grow, shown in its "nothing set up yet" states. Landing pages and Stripe arrive with payments (phase 7). */
export default function Grow() {
  return (
    <Screen>
      <ScreenHeader title="Grow" />
      <SectionLabel>Get set up</SectionLabel>
      <ListRow title="Your landing page" subtitle="A page you can share that sells your coaching, with plans and a lead form." right={<Tag label="Not set up" />} />
      <ListRow title="Payments" subtitle="Connect Stripe so clients pay you directly." right={<Tag label="Not connected" />} last />
      <View style={{ paddingHorizontal: margin, paddingTop: space[4] }}>
        <Text variant="callout" color="ink2">
          Leads, referrals and business stats show here once your page and payments are live. Stats only ever use your real numbers.
        </Text>
      </View>
    </Screen>
  );
}
