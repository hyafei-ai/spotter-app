import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { INTERVENTION_ACTIONS, checkInRequestText, type InterventionAction, type TriageItem } from '@spotter/core';
import { Button, SegmentedControl, Sheet, Text, TextField, useToast, margin, space } from '@spotter/ui';
import { useRetention } from './store';

/**
 * Teams: when an assistant marks a client handled and the head coach had asked them to check in, ask
 * what they did (message, call, at a session) before clearing it. That records the check-in for the
 * business view's "kept after a check-in".
 */
export function useCheckInDone() {
  const toast = useToast();
  const completeCheckIn = useRetention((s) => s.completeCheckIn);
  const [pending, setPending] = useState<{ name: string; item: TriageItem; onDone: () => void } | null>(null);
  const [action, setAction] = useState<InterventionAction | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPending(null);
    setAction(null);
    setNote('');
  };

  /** Returns true when it took over (a check-in request was open); otherwise the caller handles it as before. */
  const ask = (name: string, open: TriageItem[], onDone: () => void): boolean => {
    const item = open.find((t) => t.reason === 'check_in_request' && t.interventionId && !t.handledAt);
    if (!item) return false;
    setPending({ name, item, onDone });
    return true;
  };

  const save = async () => {
    if (!pending || !action) return;
    setBusy(true);
    try {
      await completeCheckIn(pending.item.interventionId!, action, note.trim() || null);
      pending.onDone();
      toast({ message: `Check-in with ${pending.name.split(' ')[0]} saved` });
      close();
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Couldn’t save that. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const sheet = (
    <Sheet visible={!!pending} title="How did you check in?" onClose={close}>
      {pending ? (
        <View style={styles.body}>
          <Text color="ink2">{pending.item.detail}</Text>
          <SegmentedControl label="How you checked in" options={INTERVENTION_ACTIONS} value={action} onChange={setAction} />
          <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="What came up" maxLength={500} multiline />
          <Button label="Save and mark handled" onPress={() => void save()} loading={busy} disabled={!action} disabledReason="Pick how you checked in." />
        </View>
      ) : null}
    </Sheet>
  );

  return { ask, sheet };
}

type CheckInClient = { clientId: string; name: string; monthlyCents: number };

/**
 * "I checked in" on client detail: what the coach did (message, call, session, other) and an optional
 * note. Records a done check-in through the retention store, so "kept after a check-in" keeps working.
 */
export function useLogCheckIn(by: { id: string; name: string } | null) {
  const toast = useToast();
  const logCheckIn = useRetention((s) => s.logCheckIn);
  const [pending, setPending] = useState<{ client: CheckInClient; reason: string } | null>(null);
  const [action, setAction] = useState<InterventionAction | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setPending(null);
    setAction(null);
    setNote('');
  };
  const open = (client: CheckInClient, reason: string) => setPending({ client, reason });

  const save = async () => {
    if (!pending || !action || !by) return;
    setBusy(true);
    try {
      await logCheckIn(pending.client, by, pending.reason, action, note.trim() || null);
      toast({ message: `Check-in with ${pending.client.name.split(' ')[0]} saved` });
      close();
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Couldn’t save that. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const sheet = (
    <Sheet visible={!!pending} title="How did you check in?" onClose={close}>
      {pending ? (
        <View style={styles.body}>
          <SegmentedControl label="How you checked in" options={INTERVENTION_ACTIONS} value={action} onChange={setAction} />
          <TextField label="Note (optional)" value={note} onChangeText={setNote} placeholder="What came up" maxLength={500} multiline />
          <Button label="Save check-in" onPress={() => void save()} loading={busy} disabled={!action} disabledReason="Pick how you checked in." />
        </View>
      ) : null}
    </Sheet>
  );

  return { open, sheet };
}

/**
 * Teams only: the head coach asks the client's own coach to check in. Never offered to a solo coach
 * (checkInCoach returns null when there's nobody else to ask).
 */
export function useAskCoach(fromFirstName: string) {
  const toast = useToast();
  const handToCoach = useRetention((s) => s.handToCoach);
  const [pending, setPending] = useState<{ client: CheckInClient; coach: { id: string; name: string }; reason: string } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => {
    setPending(null);
    setNote('');
  };
  const coachFirst = pending?.coach.name.split(' ')[0] ?? '';

  const send = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await handToCoach(pending.client, pending.coach.id, pending.reason, note.trim() || null);
      toast({ message: `Asked ${coachFirst} to check in with ${pending.client.name.split(' ')[0]}` });
      close();
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Couldn’t send that. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const sheet = (
    <Sheet visible={!!pending} title={pending ? `Ask ${coachFirst} to check in` : ''} onClose={close}>
      {pending ? (
        <View style={styles.body}>
          <Text variant="callout" color="ink2">
            {coachFirst} will see: “{checkInRequestText(fromFirstName, pending.reason)}”
          </Text>
          <TextField label={`Note for ${coachFirst} (optional)`} value={note} onChangeText={setNote} placeholder="Anything they should know" maxLength={500} multiline />
          <Button label={`Ask ${coachFirst}`} onPress={() => void send()} loading={busy} />
        </View>
      ) : null}
    </Sheet>
  );

  return { open: (client: CheckInClient, coach: { id: string; name: string }, reason: string) => setPending({ client, coach, reason }), sheet };
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: margin, gap: space[3] },
});
