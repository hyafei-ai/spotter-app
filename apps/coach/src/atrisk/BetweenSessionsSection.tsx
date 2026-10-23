import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { COACH_LEVEL_TEXT, INTERVENTION_DONE_LABEL, checkInCoach, viewerSeesHealth } from '@spotter/core';
import { Button, SectionLabel, Skeleton, Text, useTheme, margin, space } from '@spotter/ui';
import { useCoach } from '../store';
import { useAskCoach, useLogCheckIn } from '../retention/CheckInDone';
import { useDemoCheckInRequests, useRetention, useRetentionViews } from '../retention/store';
import { localToday, useBetweenSessions } from './inputs';
import { useNeedsAttention, usePlanValues, useViewerLens } from './AtRiskList';
import { summaryLines, whatToAsk, whatToAskAboutTraining } from './summary';

const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * K-3 client detail → what the client shared between sessions (reads, fuel check, pain, progress,
 * cycle phase), with what to ask. Only what they chose to share; nothing else is shown or implied.
 *
 * When the client is on Clients → Needs attention, this becomes the check-in card: the level, the
 * reasons (engagement first, then the shared signals), what to ask, and "I checked in". It's the only
 * place a check-in is logged, so the reasons are never shown twice.
 *
 * Teams only: if the viewer isn't this client's coach, shared signals stay with that coach. The head
 * coach sees the neutral line instead and can ask that coach to check in.
 */
export function BetweenSessionsSection({ clientId }: { clientId: string }) {
  const { colors } = useTheme();
  const client = useCoach((s) => s.clients.find((c) => c.id === clientId));
  const { ready, data } = useBetweenSessions(clientId);
  useDemoCheckInRequests();
  const lens = useViewerLens();
  const ids = useMemo(() => [clientId], [clientId]);
  const { roster } = useNeedsAttention(ids);
  const member = roster.find((m) => m.clientId === clientId) ?? null;
  const { monthlyOf } = usePlanValues();
  const interventions = useRetention((s) => s.interventions);
  const { openByClient } = useRetentionViews();
  const logCheckIn = useLogCheckIn(lens.viewer ? { id: lens.viewer.id, name: lens.viewer.name } : null);
  const ask = useAskCoach((lens.viewer?.name ?? 'Your head coach').split(' ')[0]!);

  const first = client?.name.split(' ')[0] ?? 'This client';
  const coachId = member?.coachId ?? lens.coachOf[clientId] ?? null;
  const seesHealth = viewerSeesHealth(lens.viewerId, { coachId }, { solo: lens.solo });
  const askCoach = lens.isOwner && !lens.solo ? checkInCoach(lens.viewerId, { coachId }, lens.coaches) : null;
  const lines = seesHealth ? summaryLines(data) : [];
  const engagement = member ? member.risk.factors.filter((f) => f.kind !== 'physiology').map((f) => f.text) : [];
  const asks = [...(seesHealth ? whatToAsk(data, first) : []), ...(member ? whatToAskAboutTraining(engagement) : [])].slice(0, 3);
  const last = interventions
    .filter((i) => i.clientId === clientId && i.doneOn)
    .sort((a, b) => b.doneOn!.localeCompare(a.doneOn!))[0];
  const asked = openByClient.get(clientId);
  // Checked in within the last week: the card says so and steps back, so it doesn't keep asking.
  const recent = last && Date.parse(`${localToday()}T12:00:00Z`) - Date.parse(`${last.doneOn}T12:00:00Z`) < 7 * 86_400_000 ? last : null;
  const who = (id: string, name: string) => (id === lens.viewerId ? 'You' : name.split(' ')[0]);
  const checkInClient = client ? { clientId, name: client.name, monthlyCents: monthlyOf(clientId) || member?.monthlyCents || 0 } : null;
  const reason = engagement[0] ?? member?.risk.reasons[0] ?? 'Worth a check-in this week';

  const shared = !ready ? (
    <Skeleton height={48} />
  ) : !seesHealth ? (
    member ? null : (
      <Text variant="callout" color="ink2">
        What {first} shares about training and recovery stays between them and their coach.
      </Text>
    )
  ) : lines.length === 0 ? (
    member ? null : (
      <Text variant="callout" color="ink2">
        {first} hasn’t shared anything beyond sessions yet. They choose what to share: daily reads, fuel check, pain, progress, cycle.
      </Text>
    )
  ) : (
    <View style={{ gap: space[1] }}>
      {lines.map((l) => (
        <Text key={l.key} variant="callout" style={l.flag ? { fontWeight: '600' } : undefined}>
          {'· '}
          {l.text}
        </Text>
      ))}
    </View>
  );
  const questions = asks.length ? (
    <View style={{ gap: space[1], marginTop: space[2] }}>
      <Text variant="label" color="ink2">
        What to ask
      </Text>
      {asks.map((a) => (
        <Text key={a} variant="callout">
          {'“'}
          {a}
          {'”'}
        </Text>
      ))}
    </View>
  ) : null;

  if (!member) {
    return (
      <>
        <SectionLabel>Between sessions</SectionLabel>
        <View style={styles.body}>
          {shared}
          {questions}
          {seesHealth && lines.length ? (
            <Text variant="caption" color="ink2" style={{ marginTop: space[1] }}>
              Only what {first} chose to share with you.
            </Text>
          ) : null}
        </View>
      </>
    );
  }

  return (
    <>
      <SectionLabel>Check in</SectionLabel>
      <View
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line, borderLeftColor: member.risk.level === 'high' && !recent ? colors.brand : colors.line }]}
        accessibilityLabel={`${COACH_LEVEL_TEXT[member.risk.level]}. ${member.risk.reasons.join('. ')}`}
      >
        <Text variant="headline" style={{ color: member.risk.level === 'high' && !recent ? colors.brand : colors.ink }}>
          {COACH_LEVEL_TEXT[member.risk.level]}
        </Text>
        {engagement.map((r) => (
          <Text key={r} variant="callout">
            {'· '}
            {r}
          </Text>
        ))}
        {shared}
        {questions}
        <View style={{ gap: space[2], marginTop: space[3] }}>
          {askCoach ? (
            <Text variant="caption" color="ink2">
              {`${askCoach.name.split(' ')[0]} coaches ${first}, so what ${first} shares stays between them.`}
            </Text>
          ) : null}
          {asked && asked.coachId !== lens.viewerId ? (
            <Text variant="caption" color="ink2">{`Asked ${asked.coachName.split(' ')[0]} on ${shortDate(asked.requestedOn)} · not checked in yet`}</Text>
          ) : recent ? (
            <Text variant="bodyStrong" style={{ color: colors.success }} accessibilityRole="text">
              {`✓ ${who(recent.coachId, recent.coachName)} ${INTERVENTION_DONE_LABEL[recent.action ?? 'other']} on ${shortDate(recent.doneOn!)}. You’ll see on Keeping clients whether ${first} stayed.`}
            </Text>
          ) : last ? (
            <Text variant="caption" color="ink2">
              {`Last check-in: ${who(last.coachId, last.coachName)} ${INTERVENTION_DONE_LABEL[last.action ?? 'other']} on ${shortDate(last.doneOn!)}`}
            </Text>
          ) : null}
          {askCoach && checkInClient && !(asked && asked.coachId === askCoach.id) ? (
            <Button label={`Ask ${askCoach.name.split(' ')[0]} to check in`} kind="secondary" onPress={() => ask.open(checkInClient, askCoach, reason)} />
          ) : null}
          <Button
            label={recent ? 'Log another check-in' : 'I checked in'}
            icon="check"
            kind={recent || askCoach ? 'quiet' : 'secondary'}
            disabled={!checkInClient}
            onPress={() => checkInClient && logCheckIn.open(checkInClient, reason)}
          />
        </View>
        {seesHealth && lines.length ? (
          <Text variant="caption" color="ink2">
            Shared signals: only what {first} chose to share with you.
          </Text>
        ) : null}
      </View>
      {logCheckIn.sheet}
      {ask.sheet}
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: margin, paddingVertical: space[2] },
  card: {
    marginHorizontal: margin,
    marginVertical: space[2],
    padding: space[4],
    gap: space[1],
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderLeftWidth: 3,
  },
});
