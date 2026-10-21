import { useState } from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, ListRow, SectionLabel, Sheet, Text, TextField, useTheme, useToast, margin, space } from '@spotter/ui';
import { useRole, useTeam } from './team';

const NO_HISTORY: never[] = [];

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Client detail: who coaches this client, their history, and (owner) handing them to another coach (K-8). */
export function CoachSection({ clientId }: { clientId: string }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { isOwner } = useRole();
  const coaches = useTeam((s) => s.coaches);
  const coachOf = useTeam((s) => s.coachOf);
  const history = useTeam((s) => s.history[clientId]) ?? NO_HISTORY;
  const handOff = useTeam((s) => s.handOff);
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const current = coaches.find((c) => c.id === coachOf[clientId]);
  const name = (id: string) => coaches.find((c) => c.id === id)?.name ?? 'A former coach';
  const choices = coaches.filter((c) => c.status === 'active' && c.id !== current?.id);

  const confirm = async () => {
    if (!to) return;
    setBusy(true);
    try {
      await handOff(clientId, to, note.trim() || null);
      toast({ message: `Handed to ${name(to)}. Their history moves with them.` });
      setOpen(false);
      setTo(null);
      setNote('');
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Couldn’t hand over. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <SectionLabel>Coach</SectionLabel>
      <ListRow
        title={current?.name ?? 'Not assigned'}
        subtitle={history.length > 1 ? `${history.length - 1} earlier coach${history.length > 2 ? 'es' : ''}` : current ? `Since ${day(history.at(-1)?.from ?? new Date().toISOString())}` : undefined}
        right={isOwner && choices.length ? <Button label="Hand over" kind="quiet" full={false} onPress={() => setOpen(true)} /> : undefined}
        last={history.length <= 1}
      />
      {history.length > 1
        ? [...history].reverse().slice(1).map((h, i, arr) => (
            <ListRow key={`${h.coachId}-${h.from}`} title={name(h.coachId)} subtitle={`${day(h.from)} – ${h.to ? day(h.to) : 'now'}${h.note ? ` · ${h.note}` : ''}`} last={i === arr.length - 1} />
          ))
        : null}

      <Sheet visible={open} title="Hand to another coach" onClose={() => setOpen(false)}>
        <Text variant="callout" color="ink2" style={{ paddingHorizontal: margin, paddingBottom: space[2] }}>
          Sessions, messages and programs stay with the client, so the new coach sees everything.
        </Text>
        {choices.map((c, i) => (
          <ListRow
            key={c.id}
            title={c.name}
            subtitle={c.role === 'owner' ? 'Owner' : 'Assistant coach'}
            right={to === c.id ? <Feather name="check" size={20} color={colors.brand} /> : undefined}
            last={i === choices.length - 1}
            onPress={() => setTo(c.id)}
            accessibilityLabel={`${c.name}${to === c.id ? ', selected' : ''}`}
          />
        ))}
        <View style={{ paddingHorizontal: margin, paddingTop: space[3], gap: space[3] }}>
          <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Covering while Leo is away" />
          <Button label={to ? `Hand to ${name(to)}` : 'Choose a coach'} disabled={!to} loading={busy} onPress={() => void confirm()} />
        </View>
      </Sheet>
    </View>
  );
}
