import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { INTERVENTION_ACTIONS, type InterventionAction, type TriageItem } from '@spotter/core';
import { Button, SegmentedControl, Sheet, Text, TextField, useToast, margin, space } from '@spotter/ui';
import { useRetention } from './store';

/**
 * When a coach marks a client handled and the owner had asked them to check in, ask what they did
 * (message, call, at a session) before clearing it. That records the check-in for the owner.
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

const styles = StyleSheet.create({
  body: { paddingHorizontal: margin, gap: space[3] },
});
