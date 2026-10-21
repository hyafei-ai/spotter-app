import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useNetInfo } from '@react-native-community/netinfo';
import { Banner, Button, EmptyState, IconButton, Screen, Skeleton, Tag, Text, TextField, useTheme, useToast, margin, space } from '@spotter/ui';
import { useCoach } from '../../../src/store';
import { useAi, type BasedOn } from '../../../src/ai/store';
import { demoWeek } from '../../../src/ai/demoSource';

const IDLE = { status: 'idle' } as const;

/** K-2 check-in summary: the assistant drafts, the coach edits and approves. Nothing is sent before that tap. */
export default function AiSummary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const net = useNetInfo();
  const client = useCoach((s) => s.clients.find((c) => c.id === id));
  const stored = useAi((s) => s.summaries[id ?? '']);
  const state = stored ?? IDLE;
  const { generateSummary, editSummary, approveAndSend, discardSummary } = useAi();
  const first = client?.name.split(' ')[0] ?? 'your client';
  const offline = net.isConnected === false;
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/client/${id}`));

  // Start drafting on first open; the coach still sees and controls every step.
  useEffect(() => {
    if (id && state.status === 'idle' && !offline) void generateSummary(id);
  }, [id, state.status, offline, generateSummary]);

  if (!client || !id) {
    return (
      <Screen>
        <EmptyState message="This client isn’t in your list any more." actionLabel="Back to clients" onAction={() => router.replace('/clients')} />
      </Screen>
    );
  }

  const week = demoWeek();
  const range = `${fmtDay(week.start)} – ${fmtDay(week.end)}`;
  const isDraft = state.status === 'draft' || state.status === 'sending';
  const edited = isDraft && state.text.trim() !== state.original.trim();

  const send = async () => {
    try {
      await approveAndSend(id);
      toast({ message: `Sent to ${first}`, actionLabel: 'Open thread', onAction: () => router.push(`/client/${id}/thread`) });
    } catch (err) {
      toast({ message: (err as Error).message });
    }
  };

  const footer = isDraft ? (
    <>
      <Button
        label="Approve and send"
        icon="send"
        onPress={() => void send()}
        loading={state.status === 'sending'}
        disabled={!state.text.trim() || offline}
        disabledReason={offline ? 'You’re offline. Sending needs a connection.' : 'The message is empty.'}
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button label="Redraft" kind="quiet" icon="refresh-cw" onPress={() => void generateSummary(id)} disabled={state.status === 'sending' || offline} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Discard" kind="quiet" onPress={() => { discardSummary(id); back(); }} disabled={state.status === 'sending'} />
        </View>
      </View>
    </>
  ) : state.status === 'sent' ? (
    <Button label="Open thread" kind="secondary" icon="message-square" onPress={() => router.push(`/client/${id}/thread`)} />
  ) : undefined;

  return (
    <Screen
      banner={offline ? <Banner tone="warning" message="You’re offline. Drafting and sending need a connection." /> : undefined}
      footer={footer}
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <View style={styles.titleRow}>
          <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
            Week summary
          </Text>
          {state.status === 'sent' ? <Tag label="Sent" tone="success" /> : <Tag label="Draft" tone="brand" />}
          {edited ? <Tag label="Edited" /> : null}
        </View>
        <Text color="ink2">
          For {client.name} · {range}
        </Text>
      </View>

      {state.status === 'idle' || state.status === 'generating' ? (
        <View style={styles.body} accessibilityLiveRegion="polite" accessibilityLabel="Drafting the summary from this week’s logs">
          <Text color="ink2">Drafting from this week’s logs…</Text>
          <View style={{ gap: space[2], marginTop: space[3] }}>
            {[92, 78, 85, 60].map((w) => (
              <Skeleton key={w} width={`${w}%`} height={18} />
            ))}
          </View>
        </View>
      ) : null}

      {state.status === 'failed' ? (
        <View style={styles.body}>
          <View accessibilityRole="alert" style={[styles.notice, { borderLeftColor: colors.error, backgroundColor: colors.surface }]}>
            <Text variant="bodyStrong">The draft didn’t come through</Text>
            <Text variant="callout" color="ink2">
              {state.message}
            </Text>
          </View>
          <View style={{ marginTop: space[4], gap: space[2] }}>
            <Button label="Try again" icon="refresh-cw" onPress={() => void generateSummary(id)} disabled={offline} disabledReason="You’re offline." />
            <Button label={`Write to ${first} yourself`} kind="quiet" onPress={() => router.push(`/client/${id}/thread`)} />
          </View>
        </View>
      ) : null}

      {state.status === 'cap' ? (
        <EmptyState message={state.message} actionLabel={`Write to ${first} yourself`} onAction={() => router.push(`/client/${id}/thread`)} />
      ) : null}

      {state.status === 'nothing' ? (
        <EmptyState message={state.message} actionLabel={`Message ${first}`} onAction={() => router.push(`/client/${id}/thread`)} />
      ) : null}

      {isDraft ? (
        <View style={styles.body}>
          <BasedOnLine b={state.basedOn} />
          <View style={{ marginTop: space[4] }}>
            <TextField
              label="Draft · edit before sending"
              value={state.text}
              onChangeText={(t) => editSummary(id, t)}
              multiline
              editable={state.status === 'draft'}
              hint={`Drafted by the assistant. ${first} only sees it after you approve.`}
            />
          </View>
        </View>
      ) : null}

      {state.status === 'sent' ? (
        <View style={styles.body}>
          <BasedOnLine b={state.basedOn} />
          <View style={[styles.sent, { borderColor: colors.line, backgroundColor: colors.surface }]}>
            <Text>{state.text}</Text>
          </View>
          <Text variant="caption" color="ink2" style={{ marginTop: space[2] }}>
            Approved{state.edited ? ' with your edits' : ''} and sent to {first}’s thread{' '}
            {new Date(state.sentAt).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

function BasedOnLine({ b }: { b: BasedOn }) {
  const bits = [
    `${b.sessionsDone} of ${b.sessionsPlanned} sessions`,
    `${b.sets} sets`,
    b.records ? `${b.records} record${b.records === 1 ? '' : 's'}` : null,
    b.checkInSubmitted ? 'check-in submitted' : 'no check-in yet',
    b.photosSubmitted ? 'photos submitted (not sent to the assistant)' : null,
  ].filter(Boolean);
  return (
    <View style={{ gap: 2 }}>
      <Text variant="label" color="ink2">
        Based on
      </Text>
      <Text variant="callout">{bits.join(' · ')}</Text>
    </View>
  );
}

function fmtDay(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  body: { paddingHorizontal: margin, paddingTop: space[5] },
  notice: { padding: space[3], borderLeftWidth: 3, borderRadius: 6, gap: 2 },
  sent: { marginTop: space[4], padding: space[4], borderWidth: StyleSheet.hairlineWidth, borderRadius: 10 },
  row: { flexDirection: 'row', gap: space[2] },
});
