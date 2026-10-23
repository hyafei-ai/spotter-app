import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { revenueSplitProblem } from '@spotter/core';
import { Button, EmptyState, IconButton, ListRow, Monogram, Screen, SectionLabel, Sheet, Tag, Text, TextField, useToast, margin, space } from '@spotter/ui';
import { QrCode } from '@spotter/ui/platform';
import { initials } from '../../src/store';
import { useRole, useTeam } from '../../src/platform/team';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** K-8 team: coaches, their clients and revenue splits; invite an assistant coach. Head coach (owner role) only. */
export default function Team() {
  const toast = useToast();
  const { isOwner } = useRole();
  const coaches = useTeam((s) => s.coaches);
  const coachOf = useTeam((s) => s.coachOf);
  const inviteCoach = useTeam((s) => s.inviteCoach);
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [split, setSplit] = useState('60');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ url: string; emailed: boolean } | null>(null);
  const back = <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))} />;

  if (!isOwner) {
    return (
      <Screen>
        <View style={styles.nav}>{back}</View>
        <EmptyState message="Only the head coach manages the team." />
      </Screen>
    );
  }

  const pct = Number(split) / 100;
  const problem = !name.trim() ? 'Add their name.' : !EMAIL_RE.test(email.trim()) ? 'Add a full email address.' : revenueSplitProblem(pct);
  const send = async () => {
    setBusy(true);
    try {
      setSent(await inviteCoach(name.trim(), email.trim(), pct));
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Couldn’t send the invite.' });
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    setInviting(false);
    setSent(null);
    setName('');
    setEmail('');
    setSplit('60');
  };

  return (
    <Screen footer={<Button label="Invite a coach" icon="user-plus" onPress={() => setInviting(true)} />}>
      <View style={styles.nav}>{back}</View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Team
        </Text>
        <Text color="ink2">Assistant coaches see only the clients you give them, and never billing, branding or publishing.</Text>
      </View>
      <SectionLabel>Coaches</SectionLabel>
      {coaches.map((c, i) => {
        const n = Object.values(coachOf).filter((id) => id === c.id).length;
        return (
          <ListRow
            key={c.id}
            left={<Monogram initials={initials(c.name)} size={40} />}
            title={c.name}
            subtitle={
              c.status === 'invited'
                ? `Invited · ${c.email}`
                : `${c.role === 'owner' ? 'Owner' : `Assistant · keeps ${Math.round(c.split * 100)}% of client revenue`} · ${n} client${n === 1 ? '' : 's'}`
            }
            right={c.status === 'invited' ? <Tag label="Invited" /> : undefined}
            chevron={c.role !== 'owner' && c.status === 'active'}
            onPress={c.role !== 'owner' && c.status === 'active' ? () => router.push(`/team/${c.id}`) : undefined}
            last={i === coaches.length - 1}
          />
        );
      })}

      <Sheet visible={inviting} title={sent ? 'Invite ready' : 'Invite a coach'} onClose={close}>
        {sent ? (
          <View style={styles.sheetBody}>
            <Text>
              {sent.emailed ? `We emailed ${email.trim()} a link. ` : ''}They can also scan this code or open the link to join as an assistant coach.
            </Text>
            <View style={styles.qr}>
              <QrCode value={sent.url} size={180} label={`QR code for ${name.trim()}'s invite`} />
            </View>
            <Text variant="caption" color="ink2" selectable>
              {sent.url}
            </Text>
            <Button label="Done" onPress={close} />
          </View>
        ) : (
          <View style={styles.sheetBody}>
            <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
            <TextField label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
            <TextField
              label="Their share of client revenue (%)"
              value={split}
              onChangeText={setSplit}
              keyboardType="number-pad"
              hint="You keep the rest of what their clients pay."
              error={split && revenueSplitProblem(pct) ? revenueSplitProblem(pct)! : undefined}
            />
            <Button label="Send invite" onPress={() => void send()} loading={busy} disabled={!!problem} disabledReason={problem ?? undefined} />
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2] },
  sheetBody: { paddingHorizontal: margin, gap: space[3] },
  qr: { alignItems: 'center', paddingVertical: space[2] },
});
