import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import {
  INTERVENTION_DONE_LABEL,
  KEPT_AFTER_DAYS,
  KEPT_CAVEAT,
  SPOTTER_PRICE_MONTHLY_CENTS,
  approxMoney,
  checkInRequestText,
  yearlyAssumption,
  yearlyValueCents,
  type KeptRow,
  type MemberAssessment,
} from '@spotter/core';
import {
  Banner,
  Button,
  EmptyState,
  IconButton,
  ListRow,
  Monogram,
  Screen,
  SectionLabel,
  SegmentedControl,
  Sheet,
  Skeleton,
  Tag,
  Text,
  TextField,
  useToast,
  margin,
  space,
} from '@spotter/ui';
import { isConfigured } from '@spotter/ui/platform';
import { initials } from '../src/store';
import { useRole, useTeam } from '../src/platform/team';
import { useRetention, useRetentionViews } from '../src/retention/store';

const DAY = 86_400_000;
const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const first = (name: string) => name.split(' ')[0]!;

/** Owner job: who to check in with before they leave, ask a coach to do it, and see who stayed. Owner only. */
export default function Members() {
  const toast = useToast();
  const { isOwner, viewer } = useRole();
  const allCoaches = useTeam((s) => s.coaches);
  const coaches = allCoaches.filter((c) => c.status === 'active');
  const { status, error, currency, loadedAt, load, handToCoach } = useRetention();
  const { talk, kept, openByClient } = useRetentionViews();
  const [online, setOnline] = useState(true);
  const [picked, setPicked] = useState<MemberAssessment | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)), []);
  useEffect(() => {
    if (isOwner) void load();
  }, [isOwner, load]);

  const back = <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))} />;

  if (!isOwner) {
    return (
      <Screen>
        <View style={styles.nav}>{back}</View>
        <EmptyState message="Only the owner sees this list." />
      </Screen>
    );
  }

  const live = isConfigured();
  const ownerFirst = first(viewer?.name ?? 'Your owner');
  const coachName = (id: string | null) => coaches.find((c) => c.id === id)?.name ?? 'Coach';
  const open = (m: MemberAssessment) => {
    setPicked(m);
    setCoachId(openByClient.get(m.clientId)?.coachId ?? m.coachId ?? viewer?.id ?? null);
    setNote('');
  };
  const send = async () => {
    if (!picked || !coachId) return;
    setBusy(true);
    try {
      await handToCoach(picked, coachId, picked.risk.reasons[0] ?? 'Hasn’t trained lately', note.trim() || null);
      toast({ message: coachId === viewer?.id ? `Added ${first(picked.name)} to your Clients list` : `Asked ${first(coachName(coachId))} to check in with ${first(picked.name)}` });
      setPicked(null);
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : 'Couldn’t send that. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const high = talk.members.filter((m) => m.risk.level === 'high');
  const medium = talk.members.filter((m) => m.risk.level === 'medium');
  const notEnough = talk.considered === 0 || talk.considered === talk.tooNew;

  const row = (m: MemberAssessment, i: number, list: MemberAssessment[]) => {
    const asked = openByClient.get(m.clientId);
    const value = m.yearlyCents != null ? `${approxMoney(m.yearlyCents, currency)} a year` : 'Pay as you go';
    const more = m.risk.reasons.slice(1).join(' · ');
    return (
      <ListRow
        key={m.clientId}
        left={<Monogram initials={initials(m.name)} size={40} />}
        title={m.name}
        reason={m.risk.reasons[0]}
        subtitle={[more, `${m.planName ?? 'No plan'} · ${value}`, asked ? `Asked ${first(asked.coachName)} on ${shortDate(asked.requestedOn)}` : null].filter(Boolean).join('\n')}
        right={asked ? <Tag label="Asked" tone="brand" /> : undefined}
        chevron={!asked}
        onPress={() => open(m)}
        accessibilityHint="Opens the reasons and lets you ask a coach to check in."
        last={i === list.length - 1}
      />
    );
  };

  const banner = !online ? (
    <Banner message={loadedAt ? `You’re offline. This list is from ${new Date(loadedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.` : 'You’re offline.'} />
  ) : error && status === 'ready' ? (
    <Banner tone="error" message={error} actionLabel="Retry" onAction={() => void load()} />
  ) : undefined;

  return (
    <Screen banner={banner}>
      <View style={styles.nav}>{back}</View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Members to talk to
        </Text>
        <Text color="ink2">Training or app use has dropped off for these members. A coach checking in this week gives them a reason to stay.</Text>
        {!live ? (
          <Text variant="caption" color="ink2">
            Sample members (MOCK). Numbers are worked out the same way as live data.
          </Text>
        ) : null}
      </View>

      {status === 'idle' || status === 'loading' ? (
        <View style={styles.body} accessibilityLabel="Loading members" accessibilityRole="progressbar">
          {[0, 1, 2].map((k) => (
            <View key={k} style={styles.skel}>
              <Skeleton width="50%" height={18} />
              <Skeleton width="80%" />
            </View>
          ))}
        </View>
      ) : status === 'error' ? (
        <EmptyState message={error ?? 'Couldn’t load your members.'} actionLabel="Try again" onAction={() => void load()} />
      ) : (
        <>
          {notEnough ? (
            <EmptyState message="Not enough data yet. Members show up here after two weeks of training with you." />
          ) : talk.members.length === 0 ? (
            <EmptyState message="Nobody needs a nudge this week." />
          ) : (
            <>
              {high.length ? <SectionLabel>Talk to this week</SectionLabel> : null}
              {high.map(row)}
              {medium.length ? <SectionLabel>Worth a check-in</SectionLabel> : null}
              {medium.map(row)}
              <Text variant="caption" color="ink2" style={styles.foot}>
                Yearly value is their monthly plan × 12. Pay-as-you-go packs don’t get one.
                {talk.tooNew ? ` ${talk.tooNew} newer member${talk.tooNew === 1 ? ' isn’t' : 's aren’t'} listed until they’ve trained for two weeks.` : ''}
              </Text>
            </>
          )}

          <KeptSection kept={kept} currency={currency} />
        </>
      )}

      <Sheet visible={!!picked} title={picked?.name ?? ''} onClose={() => setPicked(null)}>
        {picked ? (
          <View style={styles.sheetBody}>
            <View style={{ gap: space[1] }}>
              {picked.risk.reasons.map((r) => (
                <Text key={r}>• {r}</Text>
              ))}
            </View>
            <Text variant="callout" color="ink2">
              {picked.yearlyCents != null
                ? `${approxMoney(picked.yearlyCents, currency)} a year: ${yearlyAssumption(picked.monthlyCents, currency)}.`
                : 'Pay as you go, so there’s no yearly figure.'}
            </Text>
            {coaches.length > 1 ? (
              <SegmentedControl
                label="Who should check in"
                options={coaches.map((c) => ({ value: c.id, label: c.id === viewer?.id ? 'Me' : first(c.name) }))}
                value={coachId}
                onChange={setCoachId}
              />
            ) : null}
            <TextField label="Note for the coach (optional)" value={note} onChangeText={setNote} placeholder="Anything they should know" maxLength={500} multiline />
            {coachId && coachId !== viewer?.id ? (
              <Text variant="caption" color="ink2">
                {first(coachName(coachId))} will see: “{checkInRequestText(ownerFirst, picked.risk.reasons[0] ?? '')}”
              </Text>
            ) : null}
            <Button
              label={coachId === viewer?.id ? 'Add to my Clients list' : `Ask ${first(coachName(coachId))} to check in`}
              onPress={() => void send()}
              loading={busy}
              disabled={!coachId || (live && !online)}
              disabledReason={live && !online ? 'You’re offline. Try again when you’re connected.' : 'Pick a coach.'}
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function KeptSection({ kept, currency }: { kept: ReturnType<typeof useRetentionViews>['kept']; currency: string }) {
  const n = kept.kept.length;
  const any = n + kept.left.length + kept.pending.length + kept.waiting.length > 0;
  const how = (r: KeptRow) => (r.action ? INTERVENTION_DONE_LABEL[r.action] : 'checked in');
  const line = (r: KeptRow) => {
    const by = `${first(r.coachName)} · ${how(r)} on ${shortDate(r.doneOn ?? r.requestedOn)}`;
    switch (r.outcome) {
      case 'kept':
        return `${by} · still with you`;
      case 'left':
        return `${by} · left`;
      case 'pending': {
        const at = new Date(Date.parse(`${r.doneOn}T12:00:00Z`) + KEPT_AFTER_DAYS * DAY).toISOString();
        return `${by} · we’ll know on ${shortDate(at)}`;
      }
      default:
        return `Asked ${first(r.coachName)} on ${shortDate(r.requestedOn)} · not checked in yet`;
    }
  };
  const rows = [...kept.kept, ...kept.pending, ...kept.waiting, ...kept.left];
  return (
    <>
      <SectionLabel>Kept after a check-in</SectionLabel>
      <View style={styles.body}>
        <Text variant="headline" accessibilityRole="header">
          {`Kept this year: ${n} member${n === 1 ? '' : 's'}${n ? ` · ${approxMoney(kept.keptYearlyCents, currency)} a year` : ''}`}
        </Text>
        <Text variant="callout" color="ink2">
          {KEPT_CAVEAT}
        </Text>
        {SPOTTER_PRICE_MONTHLY_CENTS != null && n ? (
          <Text variant="callout" color="ink2">{`Spotter costs ${approxMoney(yearlyValueCents(SPOTTER_PRICE_MONTHLY_CENTS), currency)} a year.`}</Text>
        ) : null}
        {!any ? <Text color="ink2">When a coach checks in with someone on this list, you’ll see here whether they stayed.</Text> : null}
      </View>
      {rows.map((r, i) => (
        <ListRow
          key={r.id}
          title={r.clientName}
          subtitle={line(r)}
          right={
            r.outcome === 'kept' ? (
              <Tag label="Kept" tone="success" />
            ) : r.outcome === 'left' ? (
              <Tag label="Left" />
            ) : r.outcome === 'pending' ? (
              <Tag label="Pending" tone="warning" />
            ) : (
              <Tag label="Asked" tone="brand" />
            )
          }
          last={i === rows.length - 1}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2], paddingBottom: space[2] },
  body: { paddingHorizontal: margin, gap: space[2], paddingBottom: space[2] },
  skel: { gap: space[2], paddingVertical: space[3] },
  foot: { paddingHorizontal: margin, paddingTop: space[3] },
  sheetBody: { paddingHorizontal: margin, gap: space[3] },
});
