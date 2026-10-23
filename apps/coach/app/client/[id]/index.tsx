import { useMemo } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  buildTriage,
  connectedSummary,
  formatDuration,
  formatWeight,
  reasonText,
  viewerSeesHealth,
  volumeKg,
} from '@spotter/core';
import { DEMO_HISTORY, DEMO_CLIENTS, isSampleClient } from '@spotter/core/demo';
import {
  Button,
  EmptyState,
  IconButton,
  ListRow,
  Monogram,
  Screen,
  SectionLabel,
  Tag,
  Text,
  TextField,
  useTheme,
  useToast,
  margin,
  space,
} from '@spotter/ui';
import { tenant } from '../../../src/env';
import { initials, useCoach } from '../../../src/store';
import { ClientSections } from '../../../src/ClientSections';
import { BetweenSessionsSection } from '../../../src/atrisk/BetweenSessionsSection';
import { PrepCard } from '../../../src/memory/PrepCard';
import { useMemoryTriage } from '../../../src/memory/useClientMemory';
import { useCheckInDone } from '../../../src/retention/CheckInDone';
import { triageForViewer } from '../../../src/retention/store';
import { useRole } from '../../../src/platform/team';
import { useViewerLens } from '../../../src/atrisk/AtRiskList';
import { useSharedCycle } from '../../../src/CycleSection';
import { clientDays, clientPatterns, clientWins, useClient } from '../../../src/today/data';
import { isWaiting } from '../../../src/today/useToday';
import { WhatWorks } from '../../../src/client/WhatWorks';
import { Timeline } from '../../../src/client/Timeline';
import { Wins } from '../../../src/client/Wins';

/**
 * K-3 client detail, in the order a coach thinks (docs/ux/coach-experience.md): what works for them (the
 * playbook and their patterns) → what's happening (the timeline, wins) → what to do (check in, waiting
 * items, prep, program and the rest).
 */
export default function ClientDetail() {
  const { id, connected } = useLocalSearchParams<{ id: string; connected?: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const { triage, notes, setNote, setPaused, markHandled, restore } = useCoach();
  const c = useClient(id);
  useMemoryTriage();
  const checkIn = useCheckInDone();
  const { viewerId } = useRole();
  const lens = useViewerLens();
  const sample = !!id && isSampleClient(id);
  const seesHealth =
    sample ||
    viewerSeesHealth(
      lens.viewerId,
      { coachId: lens.coachOf[id ?? ''] ?? null },
      { solo: lens.solo },
    );
  const sharedCycle = useSharedCycle(id ?? '');
  const withCycle = seesHealth && (sample || !!sharedCycle.cycle);
  const days = useMemo(() => (id ? clientDays(id, 56, withCycle) : []), [id, withCycle]);
  const patterns = useMemo(
    () => (id && seesHealth ? clientPatterns(id, withCycle) : []),
    [id, seesHealth, withCycle],
  );
  const wins = useMemo(() => (id ? clientWins(id) : []), [id]);
  const longDays = useMemo(() => (id ? clientDays(id, 112, withCycle) : []), [id, withCycle]);
  const history = useMemo(
    () => (connected ? connectedSummary(longDays) : null),
    [connected, longDays],
  );
  const back = (
    <IconButton
      icon="arrow-left"
      label="Back"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/today'))}
    />
  );

  if (!c) {
    return (
      <Screen>
        <View style={styles.nav}>{back}</View>
        <EmptyState
          message="This client isn’t in your list any more."
          actionLabel="Back to clients"
          onAction={() => router.replace('/clients')}
        />
      </Screen>
    );
  }

  const first = c.name.split(' ')[0]!;
  // Waiting-on-you items only: check-in reasons live on the Check in card, so nothing is said twice.
  const open = buildTriage(
    triageForViewer(triage, viewerId).filter((t) => isWaiting(t.reason)),
  ).find((r) => r.clientId === c.id);
  // MOCK: only the demo client (Jordan) has logged sessions in the sample data.
  const logs = c.id === DEMO_CLIENTS[0]!.id ? [...DEMO_HISTORY].reverse() : [];
  const paused = c.status === 'paused';

  const togglePause = () => {
    const go = () => setPaused(c.id, !paused);
    const msg = paused
      ? 'Sessions start again from today.'
      : 'Their program stops and no sessions show as missed until you resume.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(msg)) go();
    } else {
      Alert.alert(paused ? 'Resume coaching?' : 'Pause coaching?', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: paused ? 'Resume' : 'Pause', onPress: go },
      ]);
    }
  };

  const intro = (
    <>
      <View style={styles.nav}>{back}</View>
      <View style={styles.head}>
        <Monogram initials={initials(c.name)} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title" accessibilityRole="header">
            {c.name}
          </Text>
          <Text variant="callout" color="ink2">
            {sample
              ? 'Sample client · made-up data (MOCK) to show what you’ll see'
              : `${c.plan} · since ${new Date(c.startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </Text>
          <View style={styles.tags}>
            {sample ? <Tag label="Sample" /> : null}
            {paused ? <Tag label="Paused" /> : null}
            {c.status === 'new' ? <Tag label="New" tone="brand" /> : null}
            {c.flags.includes('payment') ? <Tag label="Payment failed" tone="error" /> : null}
            {c.flags.includes('parq') ? <Tag label="PAR-Q flag" tone="warning" /> : null}
            {c.flags.includes('injury') ? <Tag label="Injury" tone="warning" /> : null}
          </View>
        </View>
      </View>

      {c.injuryNote ? (
        <View
          style={[
            styles.flag,
            { borderLeftColor: colors.warning, backgroundColor: colors.surface },
          ]}
        >
          <Text variant="label" color="ink2">
            Injury note
          </Text>
          <Text variant="callout">{c.injuryNote}</Text>
        </View>
      ) : null}

      {history ? (
        <View
          style={[
            styles.flag,
            { borderLeftColor: colors.success, backgroundColor: colors.surface },
          ]}
          accessibilityRole="summary"
        >
          <Text variant="bodyStrong">{`${first} is connected. Here’s their last ${history.weeks} weeks.`}</Text>
          <Text variant="callout" color="ink2">
            {`From the history their health app shares: ${history.text.replace(/^\d+ weeks?: /, '')}. Patterns below come from it.`}
          </Text>
        </View>
      ) : null}

      <WhatWorks
        clientId={c.id}
        first={first}
        patterns={patterns}
        history={longDays}
        hidden={
          seesHealth
            ? undefined
            : `What works for ${first} comes from what ${first} shares with their coach, so it stays with them.`
        }
      />
      <Timeline
        days={days}
        first={first}
        healthVisible={seesHealth}
        empty={
          <>
            <Text variant="title" accessibilityRole="header">
              Last 8 weeks
            </Text>
            <Text variant="callout" color="ink2">
              {`Nothing synced yet. When ${first} connects Apple Health or Health Connect, the history their health app shares shows up here: workouts, sleep, HRV, resting heart rate and food, and the cycle if ${first} chooses to share it.`}
            </Text>
          </>
        }
      />
      <Wins client={c} wins={wins} healthVisible={seesHealth} />
    </>
  );

  if (sample) {
    return (
      <Screen
        footer={
          <Button
            label="Invite your first client"
            icon="user-plus"
            onPress={() => router.push('/invite')}
          />
        }
      >
        {intro}
        <Text variant="caption" color="ink2" style={[styles.body, { paddingTop: space[6] }]}>
          {`${first} is a sample (MOCK). With a real client, below this you’ll find their check-in card, program, messages, form checks and notes.`}
        </Text>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          label={`Message ${first}`}
          icon="message-square"
          onPress={() => router.push(`/client/${c.id}/thread`)}
        />
      }
    >
      {intro}

      <Text variant="title" accessibilityRole="header" style={styles.what}>
        What to do
      </Text>
      <BetweenSessionsSection clientId={c.id} />

      {open ? (
        <>
          <SectionLabel
            right={
              <Text
                variant="bodyStrong"
                style={{ color: colors.brand }}
                accessibilityRole="button"
                onPress={() => {
                  // Teams: the head coach asked for a check-in, so record how it happened first.
                  if (checkIn.ask(c.name, open.items, () => markHandled(c.id))) return;
                  const items = markHandled(c.id);
                  toast({
                    message: 'Done. Cleared from Needs you.',
                    actionLabel: 'Undo',
                    onAction: () => restore(items),
                  });
                }}
              >
                Done
              </Text>
            }
          >
            Waiting on you
          </SectionLabel>
          {open.items.map((t, i) => (
            <ListRow key={t.id} title={reasonText(t)} last={i === open.items.length - 1} />
          ))}
        </>
      ) : null}

      <PrepCard clientId={c.id} />

      <SectionLabel>This week</SectionLabel>
      <Text style={styles.body}>
        {paused
          ? 'Coaching is paused.'
          : `${c.thisWeek.done} of ${c.thisWeek.planned} sessions done`}
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

      <ClientSections clientId={c.id} />

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
      <ListRow
        title="Intake"
        subtitle={
          c.flags.includes('parq') ? 'Submitted · answered yes to a PAR-Q question' : 'Submitted'
        }
      />
      <ListRow title="Liability waiver" subtitle="Signed · version 1" last />

      <View style={[styles.body, { paddingTop: space[6] }]}>
        <Button
          label={paused ? 'Resume coaching' : 'Pause coaching'}
          kind="secondary"
          onPress={togglePause}
        />
      </View>
      {checkIn.sheet}
    </Screen>
  );
}

const styles = StyleSheet.create({
  what: { paddingHorizontal: margin, paddingTop: space[8] },
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: {
    flexDirection: 'row',
    gap: space[4],
    paddingHorizontal: margin,
    paddingBottom: space[2],
    alignItems: 'flex-start',
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1], marginTop: space[1] },
  flag: {
    marginHorizontal: margin,
    marginTop: space[3],
    padding: space[3],
    borderLeftWidth: 3,
    borderRadius: 6,
    gap: 2,
  },
  body: { paddingHorizontal: margin, paddingTop: space[3] },
});
