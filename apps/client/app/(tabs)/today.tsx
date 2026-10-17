import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Button, EmptyState, ListRow, SectionLabel, Skeleton, Tag, Text, Tally, useTheme, margin, space, Screen } from '@spotter/ui';
import { isoDay } from '@spotter/core/demo';
import { SyncBanner } from '../../src/SyncBanner';
import { tenant } from '../../src/env';
import { longDate, prescriptionLine } from '../../src/format';
import { isFinishedToday, suggestionFor, todayPlan, useApp } from '../../src/store';

/** C-3 Today. Header is the session name, never a greeting. One primary action. */
export default function Today() {
  const { hydrated, active, completed, demo, startSession } = useApp();
  const plan = todayPlan(demo.todayMode);
  const done = isFinishedToday(completed, plan);
  const first = tenant.coach.name.split(' ')[0];

  if (!hydrated) {
    return (
      <Screen>
        <View style={[styles.head, { gap: space[3] }]}>
          <Skeleton width="45%" height={30} />
          <Skeleton width="35%" />
          <Skeleton height={60} style={{ marginTop: space[4] }} />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={44} />
          ))}
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
          <Text variant="title" accessibilityRole="header">
            {active.plan.title}
          </Text>
          <Text color="ink2">In progress · {active.sets.length} of {planned} sets logged</Text>
        </View>
        <Text style={styles.body} color="ink2">
          Everything you logged is saved on your phone.
        </Text>
      </Screen>
    );
  }

  if (demo.todayMode === 'none') {
    return (
      <Screen banner={<SyncBanner />}>
        <View style={styles.head}>
          <Text variant="title" accessibilityRole="header">
            {longDate(isoDay(0))}
          </Text>
        </View>
        <EmptyState
          message={`${first} is building your program. You’ll get a notification when it’s ready.`}
          actionLabel={`Message ${first}`}
          onAction={() => router.push('/coach')}
        />
      </Screen>
    );
  }

  if (!plan) {
    return (
      <Screen banner={<SyncBanner />}>
        <View style={styles.head}>
          <Text variant="title" accessibilityRole="header">
            Rest day
          </Text>
          <Text color="ink2">{longDate(isoDay(0))}</Text>
        </View>
        <CoachNote name={first ?? ''} text={tenant.coach.restDayLine} />
        <SectionLabel>Optional</SectionLabel>
        {/* MOCK DATA: rest-day tasks come from the coach's program. */}
        <ListRow title="20-minute walk" subtitle="Any pace" />
        <ListRow title="Hip and ankle mobility" subtitle="10 minutes" last />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen banner={<SyncBanner />} footer={<Button label="See the log" kind="secondary" onPress={() => router.push(`/history/${done.sessionId}`)} />}>
        <View style={styles.head}>
          <Text variant="title" accessibilityRole="header">
            {plan.title} · done
          </Text>
          <Text color="ink2">{longDate(plan.scheduledDate)}</Text>
        </View>
        <View style={styles.body}>
          <Tally count={done.sets.length} />
          <Text color="ink2" style={{ marginTop: space[3] }}>
            {done.sets.length} sets logged. {first} will see them once they sync.
          </Text>
        </View>
      </Screen>
    );
  }

  const start = async () => {
    const id = await startSession(plan);
    router.push(`/session/${id}`);
  };

  return (
    <Screen banner={<SyncBanner />} footer={<Button label={`Start ${plan.title}`} onPress={start} />}>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          {plan.title}
        </Text>
        <Text color="ink2">{longDate(plan.scheduledDate)}</Text>
      </View>
      {plan.coachNote ? <CoachNote name={first ?? ''} text={plan.coachNote} /> : null}
      <SectionLabel>{`${plan.exercises.length} exercises`}</SectionLabel>
      {plan.exercises.map((e, i) => {
        const s = suggestionFor(e, completed);
        return (
          <ListRow
            key={e.id}
            title={e.name}
            subtitle={prescriptionLine(e, s?.suggestedLoadKg ?? null)}
            right={s ? <Tag label="Suggested" tone="brand" /> : e.supersetGroup ? <Tag label={`Superset ${e.supersetGroup}`} /> : undefined}
            last={i === plan.exercises.length - 1}
          />
        );
      })}
    </Screen>
  );
}

function CoachNote({ name, text }: { name: string; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.note, { borderLeftColor: colors.brand }]}>
      <Text variant="label" color="ink2">
        From {name}
      </Text>
      <Text variant="callout">{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: margin, paddingTop: space[6], paddingBottom: space[2], gap: space[1] },
  body: { paddingHorizontal: margin, paddingTop: space[4] },
  note: { marginHorizontal: margin, marginTop: space[3], borderLeftWidth: 3, paddingLeft: space[3], gap: space[1] },
});
