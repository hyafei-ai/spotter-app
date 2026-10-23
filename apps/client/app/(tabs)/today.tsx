import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import type { DailyBrief, DailyCheck, SessionPlan } from '@spotter/core';
import { Button, EmptyState, Screen, SectionLabel, Sheet, Skeleton, Tag, Text, Tally, useTheme, margin, radius, space } from '@spotter/ui';
import { isoDay } from '@spotter/core/demo';
import { SyncBanner } from '../../src/SyncBanner';
import { tenant } from '../../src/env';
import { longDate } from '../../src/format';
import { isFinishedToday, todayPlan, useApp } from '../../src/store';
import { DueItems } from '../../src/DueItems';
import { lookupDay, useAssigned } from '../../src/programs';
import { MobilityLog, type MobilitySuggestion } from '../../src/mobility/MobilityLog';
import { useBrief } from '../../src/brief/useBrief';
import { useDaily } from '../../src/daily/store';
import { localDate } from '../../src/nutrition/store';
import { useSessionCalibration } from '../../src/cycle/hooks';
import { useCycleDailyRefresh } from '../../src/cycle/CycleRow';
import { FeelLine, ReasonChips, TodoLines } from '../../src/today/BriefHero';
import { useVersions, type VersionOption } from '../../src/today/versions';

/** MOCK DATA: the coach's rest-day mobility suggestion; real builds read it from the program. */
const REST_DAY_MOBILITY: MobilitySuggestion = { title: 'Hip and ankle mobility', minutes: 10, routineId: 'mock-hips-ankles' };

const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * Today (docs/ux/client-experience.md): decide how to train today and start. The feel line is the screen's
 * display type, the reasons are chips that open their detail, and ONE recommended action is the primary
 * button, labelled with the version. Due items below. Nothing else.
 */
export default function Today() {
  const { hydrated, active, completed, demo } = useApp();
  const programLoaded = useAssigned((s) => s.loaded);
  const assignment = useAssigned((s) => s.assignment);
  const lookup = demo.todayMode === 'session' && programLoaded ? lookupDay() : null;
  const plan = todayPlan(demo.todayMode);
  const done = isFinishedToday(completed, plan);
  const first = tenant.coach.name.split(' ')[0] ?? '';
  useCycleDailyRefresh();

  if (!hydrated || !programLoaded) {
    return (
      <Screen>
        <View style={[styles.head, { gap: space[3] }]}>
          <Skeleton width="40%" height={14} />
          <Skeleton width="85%" height={40} />
          <Skeleton width="60%" height={40} />
          <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[2] }}>
            <Skeleton width={110} height={40} />
            <Skeleton width={130} height={40} />
          </View>
          <Skeleton height={88} style={{ marginTop: space[4] }} />
        </View>
      </Screen>
    );
  }

  // App was killed mid-session: offer to pick up exactly where it was (UX H6).
  if (active) {
    const planned = active.plan.exercises.reduce((n, e) => n + e.sets.length, 0);
    return (
      <Screen banner={<SyncBanner />} footer={<Button label="Resume session" onPress={() => router.push(`/session/${active.sessionId}`)} />}>
        <View style={styles.head}>
          <Kicker text={`${shortDay(isoDay(0))} · In progress`} />
          <Text variant="display" accessibilityRole="header">
            {active.plan.title}
          </Text>
          <Text color="ink2">
            {active.sets.length} of {planned} sets logged. Everything is saved on your phone.
          </Text>
        </View>
      </Screen>
    );
  }

  if (demo.todayMode === 'none') {
    return (
      <Screen banner={<SyncBanner />}>
        <View style={styles.head}>
          <Kicker text={longDate(isoDay(0))} />
          <Text variant="display" accessibilityRole="header">
            Getting ready
          </Text>
        </View>
        <EmptyState message={`${first} is building your program. You’ll get a notification when it’s ready.`} actionLabel={`Message ${first}`} onAction={() => router.push('/coach')} />
      </Screen>
    );
  }

  if (lookup && (lookup.kind === 'not_started' || lookup.kind === 'finished' || lookup.kind === 'paused')) {
    const message =
      lookup.kind === 'not_started' && assignment
        ? `Your program starts on ${longDate(assignment.startDate)}. ${first} has it ready for you.`
        : lookup.kind === 'paused'
          ? `Coaching is paused. ${first} will let you know when it starts again.`
          : `You’ve finished this program. ${first} will set up what’s next.`;
    return (
      <Screen banner={<SyncBanner />}>
        <View style={styles.head}>
          <Kicker text={longDate(isoDay(0))} />
          <Text variant="display" accessibilityRole="header">
            {lookup.kind === 'paused' ? 'Paused' : lookup.kind === 'finished' ? 'Program done' : 'Starting soon'}
          </Text>
        </View>
        <EmptyState message={message} actionLabel={`Message ${first}`} onAction={() => router.push('/coach')} />
        <DueItems />
      </Screen>
    );
  }

  if (!plan) return <RestDay first={first} />;
  if (done) return <DoneDay plan={plan} sessionId={done.sessionId} sets={done.sets.length} first={first} />;
  return <SessionDay plan={plan} first={first} />;
}

/* ---------- session day ---------- */

function SessionDay({ plan, first }: { plan: SessionPlan; first: string }) {
  const { check, brief } = useBrief(plan);
  const { options, recommended, start } = useVersions(plan, brief.suggestLighter);
  const calibration = useSessionCalibration('today', 'planned');
  const [sheet, setSheet] = useState(false);
  const [starting, setStarting] = useState(false);
  const rec = options.find((o) => o.version === recommended) ?? options[0];
  const hasRead = !!check || brief.why.length > 0;

  const go = async (o: VersionOption | undefined) => {
    if (!o) return;
    setStarting(true);
    setSheet(false);
    try {
      await start(o);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Screen
      banner={<SyncBanner />}
      footer={
        <View style={{ gap: space[1] }}>
          <Button
            label={`Start ${rec?.title ?? plan.title}`}
            loading={starting}
            onPress={() => void go(rec)}
            accessibilityHint={recommended === 'lighter' ? `Starts ${first}’s easier version, recommended by today’s brief` : `Starts ${plan.title}`}
          />
          <Button label="Other versions" kind="quiet" onPress={() => setSheet(true)} accessibilityHint="Choose the planned, easier or recovery version" />
        </View>
      }
    >
      <View style={styles.head}>
        <Kicker text={`${shortDay(plan.scheduledDate)} · ${plan.title}`} />
        {hasRead ? <FeelLine text={brief.feel} tone={brief.tone} /> : <Text variant="display" accessibilityRole="header">{plan.title}</Text>}
      </View>
      {hasRead ? (
        <View style={styles.block}>
          <ReasonChips reasons={brief.why} />
          <TodoLines brief={brief} />
          <ShareLine check={check} first={first} />
        </View>
      ) : null}
      <CheckInRow check={check} />
      <SessionBlock plan={plan} first={first} recommended={recommended} brief={brief} calibrationLine={calibration.line} />
      <DueItems />
      <VersionSheet visible={sheet} options={options} recommended={recommended} onClose={() => setSheet(false)} onPick={(o) => void go(o)} />
    </Screen>
  );
}

function Kicker({ text }: { text: string }) {
  return (
    <Text variant="label" color="ink2">
      {text}
    </Text>
  );
}

/** "From your watch and today's check · Maya sees it", tappable to Who sees what. */
function ShareLine({ check, first }: { check: DailyCheck | null; first: string }) {
  const { colors } = useTheme();
  const shareDefault = useDaily((s) => s.settings.shareDefault);
  const shared = check ? check.shareWithCoach : shareDefault;
  const from = check ? 'From your watch and today’s check' : 'From your last few nights';
  return (
    <Pressable onPress={() => router.push('/sharing')} accessibilityRole="link" accessibilityHint="Opens who sees what" hitSlop={6} style={styles.shareLine}>
      <Feather name={shared ? 'eye' : 'lock'} size={13} color={colors.ink2} />
      <Text variant="caption" color="ink2">
        {`${from} · ${shared ? (check ? `${first} sees it` : `${first} sees it when you check in`) : 'Only you'}`}
      </Text>
    </Pressable>
  );
}

/** While today's check isn't done: one row, not a card competing with Start. */
function CheckInRow({ check }: { check: DailyCheck | null }) {
  const { colors } = useTheme();
  const skippedOn = useDaily((s) => s.skippedOn);
  const skipToday = useDaily((s) => s.skipToday);
  if (check || skippedOn === localDate()) return null;
  return (
    <View style={[styles.checkRow, { borderColor: colors.line, backgroundColor: colors.surface }]}>
      <Pressable
        onPress={() => router.push('/check-today')}
        accessibilityRole="button"
        accessibilityLabel="Add how you feel. About 30 seconds"
        style={styles.checkMain}
      >
        <Feather name="edit-3" size={18} color={colors.brand} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">Add how you feel</Text>
          <Text variant="caption" color="ink2">
            Energy, soreness, stress. About 30 seconds.
          </Text>
        </View>
        <Feather name="chevron-right" size={20} color={colors.ink2} />
      </Pressable>
      <Button label="Skip" kind="quiet" full={false} onPress={skipToday} accessibilityLabel="Skip today’s check" />
    </View>
  );
}

function SessionBlock({ plan, first, recommended, brief, calibrationLine }: { plan: SessionPlan; first: string; recommended: string; brief: DailyBrief; calibrationLine: string | null }) {
  const { colors } = useTheme();
  const names = plan.exercises.map((e) => e.name);
  const minutes = Math.round(plan.exercises.reduce((n, e) => n + e.sets.length, 0) * 2.5 / 5) * 5;
  return (
    <View>
      <SectionLabel right={recommended === 'lighter' ? <Tag label="Easier version suggested" tone="brand" /> : undefined}>Today’s session</SectionLabel>
      <View style={[styles.block, { gap: space[2] }]}>
        <Text variant="headline">{plan.title}</Text>
        <Text variant="callout" color="ink2">{`${plan.exercises.length} exercises · about ${Math.max(20, minutes)} min`}</Text>
        <Text variant="callout" numberOfLines={3}>
          {names.join(' · ')}
        </Text>
        {plan.coachNote ? (
          <View style={[styles.note, { borderLeftColor: colors.brand }]}>
            <Text variant="caption" color="ink2">{`From ${first}`}</Text>
            <Text variant="callout">{plan.coachNote}</Text>
          </View>
        ) : null}
        {calibrationLine && recommended === 'planned' ? (
          <Text variant="caption" color="ink2">
            {calibrationLine}
          </Text>
        ) : brief.calibration?.reason && recommended === 'planned' ? (
          <Text variant="caption" color="ink2">
            {brief.calibration.reason}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function VersionSheet({ visible, options, recommended, onClose, onPick }: { visible: boolean; options: VersionOption[]; recommended: string; onClose: () => void; onPick: (o: VersionOption) => void }) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} title="Which version today?" onClose={onClose}>
      <View style={{ paddingHorizontal: margin, gap: space[2] }}>
        <Text variant="callout" color="ink2">
          Your call. The brief suggests one; any of these counts as today’s session.
        </Text>
        {options.map((o) => (
          <Pressable
            key={o.version}
            onPress={() => onPick(o)}
            accessibilityRole="button"
            accessibilityLabel={`Start ${o.title}${o.version === recommended ? ', suggested' : ''}. ${o.detail}`}
            style={({ pressed }) => [styles.option, { borderColor: o.version === recommended ? colors.brand : colors.line, backgroundColor: pressed ? colors.line : colors.surface }]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                <Text variant="bodyStrong">{o.title}</Text>
                {o.version === recommended ? <Tag label="Suggested" tone="brand" /> : null}
              </View>
              <Text variant="callout" color="ink2">
                {o.detail}
              </Text>
            </View>
            <Feather name="play" size={18} color={colors.ink} />
          </Pressable>
        ))}
        <Button label="Cancel" kind="quiet" onPress={onClose} />
      </View>
    </Sheet>
  );
}

/* ---------- rest day ---------- */

function RestDay({ first }: { first: string }) {
  const { check, brief } = useBrief(undefined, true);
  const { colors } = useTheme();
  const hasRead = !!check || brief.why.length > 0;
  return (
    <Screen banner={<SyncBanner />}>
      <View style={styles.head}>
        <Kicker text={`${shortDay(isoDay(0))} · Rest day`} />
        {hasRead ? <FeelLine text={brief.feel} tone={brief.tone} /> : <Text variant="display" accessibilityRole="header">Rest day</Text>}
      </View>
      {hasRead ? (
        <View style={styles.block}>
          <ReasonChips reasons={brief.why} />
          <TodoLines brief={brief} />
          <ShareLine check={check} first={first} />
        </View>
      ) : null}
      <CheckInRow check={check} />
      <View style={[styles.note, { borderLeftColor: colors.brand, marginHorizontal: margin, marginTop: space[5] }]}>
        <Text variant="caption" color="ink2">{`From ${first}`}</Text>
        <Text variant="callout">{tenant.coach.restDayLine}</Text>
      </View>
      <MobilityLog suggestion={REST_DAY_MOBILITY} />
      <DueItems />
    </Screen>
  );
}

/* ---------- session done ---------- */

function DoneDay({ plan, sessionId, sets, first }: { plan: SessionPlan; sessionId: string; sets: number; first: string }) {
  return (
    <Screen banner={<SyncBanner />} footer={<Button label="See the log" kind="secondary" onPress={() => router.push(`/history/${sessionId}`)} />}>
      <View style={styles.head}>
        <Kicker text={`${shortDay(plan.scheduledDate)} · Done`} />
        <FeelLine text={`${plan.title} done`} tone="steady" />
      </View>
      <View style={[styles.block, { gap: space[3] }]}>
        <Tally count={sets} />
        <Text color="ink2">{`${sets} sets logged. ${first} sees them once they sync.`}</Text>
      </View>
      <MobilityLog />
      <DueItems />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: margin, paddingTop: space[6], paddingBottom: space[1], gap: space[2] },
  block: { paddingHorizontal: margin, paddingTop: space[3], gap: space[3] },
  shareLine: { flexDirection: 'row', alignItems: 'center', gap: space[1], alignSelf: 'flex-start', minHeight: 28 },
  checkRow: { marginHorizontal: margin, marginTop: space[5], borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.sheet, flexDirection: 'row', alignItems: 'center', paddingRight: space[1] },
  checkMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], minHeight: 56 },
  note: { borderLeftWidth: 3, paddingLeft: space[3], gap: 2 },
  option: { flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.sheet, borderWidth: StyleSheet.hairlineWidth * 2, minHeight: 64 },
});
