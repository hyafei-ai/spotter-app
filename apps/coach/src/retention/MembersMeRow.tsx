import { router } from 'expo-router';
import { ListRow, SectionLabel } from '@spotter/ui';

/** Owner's Me tab: members to talk to and who stayed after a check-in. Wrapped in OwnerOnly by MeRows. */
export function MembersMeRow() {
  return (
    <>
      <SectionLabel>Your members</SectionLabel>
      <ListRow title="Members to talk to" subtitle="Who to check in with this week, and who stayed after you did" chevron last onPress={() => router.push('/members')} />
    </>
  );
}
