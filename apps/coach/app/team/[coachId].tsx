import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Button, EmptyState, IconButton, ListRow, Monogram, Screen, SectionLabel, Sheet, Stepper, Text, useTheme, useToast, margin, space } from '@spotter/ui';
import { initials, useCoach } from '../../src/store';
import { useRole, useTeam } from '../../src/platform/team';

/** One assistant coach: revenue split and assigned clients; assign more from the owner's list (K-8). */
export default function CoachDetail() {
  const { coachId } = useLocalSearchParams<{ coachId: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const { isOwner } = useRole();
  const coach = useTeam((s) => s.coaches.find((c) => c.id === coachId));
  const coachOf = useTeam((s) => s.coachOf);
  const coaches = useTeam((s) => s.coaches);
  const setSplit = useTeam((s) => s.setSplit);
  const handOff = useTeam((s) => s.handOff);
  const clients = useCoach((s) => s.clients);
  const [assigning, setAssigning] = useState(false);
  const back = <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/team'))} />;

  if (!coach || !isOwner) {
    return (
      <Screen>
        <View style={styles.nav}>{back}</View>
        <EmptyState message={!isOwner ? 'Only the owner manages the team.' : 'This coach isn’t on your team any more.'} actionLabel="Back to team" onAction={() => router.replace('/team')} />
      </Screen>
    );
  }

  const mine = clients.filter((c) => coachOf[c.id] === coach.id);
  const others = clients.filter((c) => coachOf[c.id] !== coach.id);
  const coachName = (id: string | undefined) => coaches.find((c) => c.id === id)?.name ?? 'No coach';

  const assign = async (clientId: string, name: string) => {
    try {
      await handOff(clientId, coach.id, `Assigned to ${coach.name}`);
      toast({ message: `${name} is now with ${coach.name.split(' ')[0]}.` });
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Couldn’t assign. Try again.' });
    }
  };

  return (
    <Screen footer={<Button label="Assign a client" icon="plus" kind="secondary" onPress={() => setAssigning(true)} disabled={others.length === 0} disabledReason="Every client is already with this coach." />}>
      <View style={styles.nav}>{back}</View>
      <View style={styles.head}>
        <Monogram initials={initials(coach.name)} size={56} />
        <View style={{ flex: 1 }}>
          <Text variant="title" accessibilityRole="header">
            {coach.name}
          </Text>
          <Text variant="callout" color="ink2">
            Assistant coach · {coach.email}
          </Text>
        </View>
      </View>
      <SectionLabel>Revenue split</SectionLabel>
      <View style={styles.body}>
        <Stepper
          label="Coach keeps"
          value={Math.round(coach.split * 100)}
          step={5}
          min={0}
          max={100}
          format={(v) => `${v}%`}
          unitLabel="percent"
          onChange={(v) => setSplit(coach.id, v / 100)}
        />
        <Text variant="caption" color="ink2">
          Of what {coach.name.split(' ')[0]}’s clients pay. You keep {100 - Math.round(coach.split * 100)}%. Applies to payments from now on.
        </Text>
      </View>
      <SectionLabel>{`Clients (${mine.length})`}</SectionLabel>
      {mine.length === 0 ? (
        <Text color="ink2" style={styles.body}>
          No clients yet. Assign one below.
        </Text>
      ) : (
        mine.map((c, i) => <ListRow key={c.id} title={c.name} subtitle={c.plan} chevron last={i === mine.length - 1} onPress={() => router.push(`/client/${c.id}`)} />)
      )}

      <Sheet visible={assigning} title={`Assign to ${coach.name.split(' ')[0]}`} onClose={() => setAssigning(false)}>
        {others.map((c, i) => (
          <ListRow
            key={c.id}
            title={c.name}
            subtitle={`Now with ${coachName(coachOf[c.id])}`}
            right={<Feather name="plus" size={20} color={colors.brand} />}
            last={i === others.length - 1}
            onPress={() => {
              setAssigning(false);
              void assign(c.id, c.name);
            }}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { flexDirection: 'row', gap: space[4], paddingHorizontal: margin, alignItems: 'center' },
  body: { paddingHorizontal: margin, paddingTop: space[3], gap: space[2] },
});
