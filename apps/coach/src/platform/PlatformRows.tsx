import { router } from 'expo-router';
import { ListRow, SectionLabel } from '@spotter/ui';
import { signOut, useAuth } from '@spotter/ui/platform';
import { useRole, useTeam } from './team';

/** Coach Me rows: team and data (owner only), notifications and sign-out (everyone). */
export function PlatformRows() {
  const { isOwner } = useRole();
  const auth = useAuth();
  const coaches = useTeam((s) => s.coaches);
  return (
    <>
      {isOwner ? (
        <>
          <SectionLabel>Business</SectionLabel>
          <ListRow
            title="Team"
            subtitle={`${coaches.length} coach${coaches.length === 1 ? '' : 'es'} · assign clients and set revenue splits`}
            chevron
            onPress={() => router.push('/team')}
          />
          <ListRow title="Import and export" subtitle="Bring clients and programs in by CSV, or download everything" chevron last onPress={() => router.push('/data')} />
        </>
      ) : null}
      <SectionLabel>Account</SectionLabel>
      <ListRow title="Notifications" subtitle="Client messages, triage, quiet hours" chevron onPress={() => router.push('/settings/notifications')} />
      <ListRow title="Saved replies" subtitle="Reuse the messages you send often" chevron last={auth.status !== 'signedIn'} onPress={() => router.push('/saved-replies')} />
      {auth.status === 'signedIn' ? <ListRow title="Sign out" subtitle={auth.email ?? undefined} last onPress={() => void signOut().then(() => router.replace('/sign-in'))} /> : null}
    </>
  );
}
