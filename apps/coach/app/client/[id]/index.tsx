import { Alert, Platform, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { buildTriage, formatDuration, formatWeight, reasonText, volumeKg } from '@spotter/core';
import { DEMO_HISTORY, DEMO_CLIENTS } from '@spotter/core/demo';
import { Button, EmptyState, IconButton, ListRow, Monogram, Screen, SectionLabel, Tag, Text, TextField, useTheme, useToast, margin, space } from '@spotter/ui';
import { tenant } from '../../../src/env';
import { initials, useCoach } from '../../../src/store';

/** K-3 client detail. */
export default function ClientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const { clients, triage, notes, setNote, setPaused, markHandled, restore } = useCoach();
  const c = clients.find((x) => x.id === id);
  const back = <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/clients'))} />;

  if (!c) {
    return (
      <Screen>
        <View style={styles.nav}>{back}</View>
        <EmptyState message="This client isn’t in your list any more." actionLabel="Back to clients" onAction={() => router.replace('/clients')} />
      </Screen>
    );
  }

  const open = buildTriage(triage).find((r) => r.clientId === c.id);
  // MOCK: only the demo client (Jordan) has logged sessions in the sample data.
  const logs = c.id === DEMO_CLIENTS[0]!.id ? [...DEMO_HISTORY].reverse() : [];
  const paused = c.status === 'paused';

  const togglePause = () => {
    const go = () => setPaused(c.id, !paused);
    const msg = paused ? 'Sessions start again from today.' : 'Their program stops and no sessions show as missed until you resume.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(msg)) go();
    } else {
      Alert.alert(paused ? 'Resume coaching?' : 'Pause coaching?', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: paused ? 'Resume' : 'Pause', onPress: go },
      ]);
    }
  };

  return (
    <Screen footer={<Button label={`Message ${c.name.split(' ')[0]}`} icon="message-square" onPress={() => router.push(`/client/${c.id}/thread`)} />}>
      <View style={styles.nav}>{back}</View>
      <View style={styles.head}>
        <Monogram initials={initials(c.name)} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title" accessibilityRole="header">
            {c.name}
          </Text>
          <Text variant="callout" color="ink2">
            {c.plan} · since {new Date(c.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
          </Text>
          <View style={styles.tags}>
            {paused ? <Tag label="Paused" /> : null}
            {c.status === 'new' ? <Tag label="New" tone="brand" /> : null}
            {c.flags.includes('payment') ? <Tag label="Payment failed" tone="error" /> : null}
            {c.flags.includes('parq') ? <Tag label="PAR-Q flag" tone="warning" /> : null}
            {c.flags.includes('injury') ? <Tag label="Injury" tone="warning" /> : null}
          </View>
        </View>
      </View>

      {c.injuryNote ? (
        <View style={[styles.flag, { borderLeftColor: colors.warning, backgroundColor: colors.surface }]}>
          <Text variant="label" color="ink2">
            Injury note
          </Text>
          <Text variant="callout">{c.injuryNote}</Text>
        </View>
      ) : null}

      {open ? (
        <>
          <SectionLabel
            right={
              <Text
                variant="bodyStrong"
                style={{ color: colors.brand }}
                accessibilityRole="button"
                onPress={() => {
                  const items = markHandled(c.id);
                  toast({ message: 'Marked handled', actionLabel: 'Undo', onAction: () => restore(items) });
                }}
              >
                Mark handled
              </Text>
            }
          >
            Needs you
          </SectionLabel>
          {open.items.map((t, i) => (
            <ListRow key={t.id} title={reasonText(t)} last={i === open.items.length - 1} />
          ))}
        </>
      ) : null}

      <SectionLabel>This week</SectionLabel>
      <Text style={styles.body}>
        {paused ? 'Coaching is paused.' : `${c.thisWeek.done} of ${c.thisWeek.planned} sessions done`}
        {c.lastSession ? <Text color="ink2">{`  ·  Last: ${c.lastSession}`}</Text> : null}
      </Text>

      <SectionLabel>Recent sessions</SectionLabel>
      {logs.length ? (
        logs.map((s, i) => (
          <ListRow
            key={s.sessionId}
            title={`${s.title} · ${new Date(s.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`}
            subtitle={`${s.sets.length} sets · ${formatDuration((Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 1000)} · ${formatWeight(volumeKg(s.sets), tenant.units)} · felt ${s.feel}/5`}
            last={i === logs.length - 1}
          />
        ))
      ) : (
        <Text color="ink2" style={styles.body}>
          No sessions logged yet.
        </Text>
      )}

      <SectionLabel>Private notes</SectionLabel>
      <View style={styles.body}>
        <TextField
          label="Only you can see these"
          value={notes[c.id] ?? ''}
          onChangeText={(t) => setNote(c.id, t)}
          multiline
          placeholder="e.g. Prefers morning sessions. Travelling 3–10 Nov."
        />
      </View>

      <SectionLabel>Intake and waiver</SectionLabel>
      <ListRow title="Intake" subtitle={c.flags.includes('parq') ? 'Submitted · answered yes to a PAR-Q question' : 'Submitted'} />
      <ListRow title="Liability waiver" subtitle="Signed · version 1" last />

      <View style={[styles.body, { paddingTop: space[6] }]}>
        <Button label={paused ? 'Resume coaching' : 'Pause coaching'} kind="secondary" onPress={togglePause} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { flexDirection: 'row', gap: space[4], paddingHorizontal: margin, paddingBottom: space[2], alignItems: 'flex-start' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1], marginTop: space[1] },
  flag: { marginHorizontal: margin, marginTop: space[3], padding: space[3], borderLeftWidth: 3, borderRadius: 6, gap: 2 },
  body: { paddingHorizontal: margin, paddingTop: space[3] },
});
