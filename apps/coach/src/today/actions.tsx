import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { isoDay, type DemoClient } from '@spotter/core/demo';
import { isSampleClient } from '@spotter/core/demo';
import { Button, Sheet, Text, TextField, useToast, margin, space } from '@spotter/ui';
import type { ActItem } from '@spotter/core';
import { activeAssignmentFor, usePrograms } from '../programs';
import { useInbox } from '../platform/inbox';
import { useTodayDone } from './store';

/**
 * Opens the client's thread with a prefilled message. `done` marks the Today item done once sent;
 * `checkIn` also logs the check-in (by message) when it's sent: the one way a Check in item closes from Today.
 * The sample client never sends anything: it says so and marks the item done.
 */
export function useOpenMessage() {
  const toast = useToast();
  const markDone = useTodayDone((s) => s.markDone);
  return (client: DemoClient, draft: string, opts: { done?: string; checkIn?: string } = {}) => {
    if (isSampleClient(client.id)) {
      if (opts.done) markDone(opts.done, 'Sample: nothing sent');
      toast({
        message:
          'Sample client: nothing was sent. With a real client, this opens their messages with the text ready.',
      });
      return;
    }
    const q = new URLSearchParams({ draft });
    if (opts.done) q.set('done', opts.done);
    if (opts.checkIn) q.set('checkin', opts.checkIn);
    router.push(`/client/${client.id}/thread?${q.toString()}`);
  };
}

/** "Offer the easier version": the message to send (editable), and editing today's session as the alternative. */
export function useOfferEasier() {
  const toast = useToast();
  const send = useInbox((s) => s.send);
  const markDone = useTodayDone((s) => s.markDone);
  const [pending, setPending] = useState<{
    client: DemoClient;
    item: ActItem;
    doneKey: string;
    lighter: string;
  } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const first = pending?.client.name.split(' ')[0] ?? '';
  const close = () => setPending(null);

  const open = (client: DemoClient, item: ActItem, doneKey: string, lighter: string) => {
    setPending({ client, item, doneKey, lighter });
    setText(item.draft);
  };

  const sendOffer = async () => {
    if (!pending) return;
    if (isSampleClient(pending.client.id)) {
      markDone(pending.doneKey, 'Sample: nothing sent');
      toast({
        message:
          'Sample client: nothing was sent. With a real client, they get this message and the easier version to pick.',
      });
      close();
      return;
    }
    setBusy(true);
    try {
      await send(pending.client.id, {
        kind: 'text',
        body: text.trim(),
        mediaUri: null,
        durationMs: null,
      });
      markDone(pending.doneKey, 'Offered the easier version');
      toast({ message: `Sent to ${first}. They can pick the easier version on their Today.` });
      close();
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Couldn’t send. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const editMyself = () => {
    if (!pending) return;
    const { client } = pending;
    close();
    const programs = usePrograms.getState();
    const a = activeAssignmentFor(programs.assignments, client.id);
    const key = a ? programs.editSession(a.id, isoDay(0)) : null;
    const dayId = key ? usePrograms.getState().drafts[key]?.program.weeks[0]?.days[0]?.id : null;
    if (key && dayId) router.push(`/program/${encodeURIComponent(key)}/day/${dayId}`);
    else if (isSampleClient(client.id))
      toast({ message: 'Sample client: with a real client, this opens today’s session to edit.' });
    else router.push(`/client/${client.id}`);
  };

  const sheet = (
    <Sheet
      visible={!!pending}
      title={pending ? `Offer ${first} the easier version` : ''}
      onClose={close}
    >
      {pending ? (
        <View style={styles.body}>
          <Text variant="callout" color="ink2">
            {`${pending.item.session} today. The easier version: ${pending.lighter.toLowerCase()}. ${first} chooses; you can change the rule on ${first}’s page.`}
          </Text>
          <TextField
            label={`Message to ${first}`}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={600}
          />
          <Button
            label={`Send to ${first}`}
            icon="send"
            onPress={() => void sendOffer()}
            loading={busy}
            disabled={!text.trim()}
            disabledReason="Write a message first."
          />
          <Button label="Edit today’s session myself" kind="quiet" onPress={editMyself} />
        </View>
      ) : null}
    </Sheet>
  );

  return { open, sheet };
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: margin, gap: space[3] },
});
