import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Banner, Button, IconButton, ListRow, Screen, SectionLabel, Sheet, Text, TextField, useToast, margin, space } from '@spotter/ui';
import { useCoach } from '../src/store';
import { useInbox } from '../src/platform/inbox';

/** Bulk message to a filtered group (K-1). Each client gets it in their own thread. */
export default function BulkMessage() {
  const { ids, label } = useLocalSearchParams<{ ids?: string; label?: string }>();
  const toast = useToast();
  const clients = useCoach((s) => s.clients);
  const replies = useInbox((s) => s.savedReplies);
  const sendBulk = useInbox((s) => s.sendBulk);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const recipients = useMemo(() => {
    const set = new Set((ids ?? '').split(',').filter(Boolean));
    return clients.filter((c) => set.has(c.id));
  }, [ids, clients]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/clients'));

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const n = await sendBulk(recipients.map((c) => c.id), body.trim());
      toast({ message: `Sent to ${n} client${n === 1 ? '' : 's'}.` });
      back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t send. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const names = recipients.map((c) => c.name.split(' ')[0]).join(', ');
  return (
    <Screen
      banner={error ? <Banner tone="error" message={error} /> : undefined}
      footer={
        <Button
          label={recipients.length ? `Send to ${recipients.length} client${recipients.length === 1 ? '' : 's'}` : 'Send'}
          onPress={() => void send()}
          loading={busy}
          disabled={!body.trim() || recipients.length === 0}
          disabledReason={recipients.length === 0 ? 'No clients selected.' : 'Write a message first.'}
        />
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back to clients" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Message {label ? label.toLowerCase() : 'clients'}
        </Text>
        <Text color="ink2" numberOfLines={3}>
          {recipients.length ? `To ${names}. Each gets it in their own thread.` : 'No clients match this filter.'}
        </Text>
      </View>
      <View style={styles.form}>
        <TextField label="Message" value={body} onChangeText={setBody} multiline maxLength={4000} />
        {replies.length ? <Button label="Use a saved reply" kind="quiet" icon="bookmark" full={false} onPress={() => setPicking(true)} /> : null}
      </View>
      <Sheet visible={picking} title="Saved replies" onClose={() => setPicking(false)}>
        <SectionLabel>Tap to use</SectionLabel>
        {replies.map((r, i) => (
          <ListRow
            key={r.id}
            title={r.title}
            subtitle={r.body}
            last={i === replies.length - 1}
            onPress={() => {
              setBody(r.body);
              setPicking(false);
            }}
          />
        ))}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2] },
  form: { paddingHorizontal: margin, paddingTop: space[4], gap: space[2], alignItems: 'stretch' },
});
