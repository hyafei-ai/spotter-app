import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ADHERENCE_LABEL, MEASUREMENT_LABEL, PHOTO_POSES, delta, toDisplay, type CheckInSubmission } from '@spotter/core';
import { Button, EmptyState, IconButton, Screen, SectionLabel, Text, useTheme, useToast, margin, radius, space } from '@spotter/ui';
import { tenant } from '../../src/env';
import { useCoach } from '../../src/store';
import { reviewedAt, useMedia } from '../../src/media/store';
import { MediaImage } from '../../src/media/MediaImage';

const day = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
};

/** Coach reads a weekly check-in (C-7): this week vs last, notes, and the client's photo timeline. */
export default function CheckInReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const { loaded, load, checkIns, reviews, markReviewed } = useMedia();
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/clients'));
  const s = checkIns.find((c) => c.id === id);
  const client = useCoach((st) => st.clients.find((c) => c.id === s?.clientId));

  if (!loaded) return <Screen>{null}</Screen>;
  if (!s) {
    return (
      <Screen>
        <View style={styles.nav}>
          <IconButton icon="arrow-left" label="Back" onPress={back} />
        </View>
        <EmptyState message="This check-in isn’t available." actionLabel="Back to clients" onAction={() => router.replace('/clients')} />
      </Screen>
    );
  }

  const history = checkIns.filter((c) => c.clientId === s.clientId).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const prev = history.filter((c) => c.dueDate < s.dueDate).at(-1);
  const read = reviewedAt(s, reviews);
  const unit = tenant.units;
  const w = (kg: number | null) => (kg == null ? null : Math.round(toDisplay(kg, unit) * 10) / 10);
  const withPhotos = history.filter((c) => c.photos.length > 0).reverse();
  const firstName = client?.name.split(' ')[0] ?? 'Client';

  const rows: { label: string; value: string; change?: string | null }[] = [];
  const a = s.answers;
  const fmtDelta = (d: number | null, u: string) => (d == null ? null : `${d > 0 ? '+' : ''}${d} ${u} since ${day(prev!.dueDate)}`);
  if (a.bodyweightKg != null) rows.push({ label: 'Bodyweight', value: `${w(a.bodyweightKg)} ${unit}`, change: prev ? fmtDelta(delta(w(a.bodyweightKg), w(prev.answers.bodyweightKg)), unit) : null });
  for (const [k, v] of Object.entries(a.measurementsCm)) {
    rows.push({ label: MEASUREMENT_LABEL[k as keyof typeof MEASUREMENT_LABEL] ?? k, value: `${v} cm`, change: prev ? fmtDelta(delta(v, prev.answers.measurementsCm[k]), 'cm') : null });
  }
  if (a.sleepHours != null) rows.push({ label: 'Sleep', value: `${a.sleepHours} h a night`, change: prev ? fmtDelta(delta(a.sleepHours, prev.answers.sleepHours), 'h') : null });
  if (a.stress != null) rows.push({ label: 'Stress', value: `${a.stress} of 5` });
  if (a.adherence) rows.push({ label: 'Plan done', value: ADHERENCE_LABEL[a.adherence] });

  return (
    <Screen
      footer={
        read ? undefined : (
          <Button
            label="Mark as read"
            icon="check"
            onPress={() => {
              void markReviewed(s);
              toast({ message: `${firstName}’s check-in marked as read` });
            }}
          />
        )
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          {client?.name ?? 'Check-in'}
        </Text>
        <Text color="ink2">
          Weekly check-in · due {day(s.dueDate)} · sent {day(s.submittedAt)}
        </Text>
        {read ? (
          <Text variant="callout" style={{ color: colors.success }}>
            Read {day(read)}
          </Text>
        ) : null}
      </View>

      <SectionLabel>This week</SectionLabel>
      <View style={styles.body}>
        {rows.map((r) => (
          <View key={r.label} style={[styles.row, { borderBottomColor: colors.line }]}>
            <Text variant="label" color="ink2" style={{ width: 110 }}>
              {r.label}
            </Text>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{r.value}</Text>
              {r.change ? (
                <Text variant="caption" color="ink2">
                  {r.change}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
        {a.notes ? (
          <View style={[styles.quote, { borderLeftColor: colors.line }]}>
            <Text variant="label" color="ink2">
              {firstName}’s note
            </Text>
            <Text>{a.notes}</Text>
          </View>
        ) : null}
      </View>

      <SectionLabel>Progress photos</SectionLabel>
      {withPhotos.length === 0 ? (
        <Text color="ink2" style={styles.body}>
          No progress photos yet.
        </Text>
      ) : (
        withPhotos.map((c) => (
          <View key={c.id} style={styles.body}>
            <Text variant="label" color="ink2">
              {day(c.dueDate)}
            </Text>
            <ScrollView horizontal contentContainerStyle={{ gap: space[2] }}>
              {PHOTO_POSES.map((pose) => {
                const p = c.photos.find((x) => x.pose === pose);
                return p ? <MediaImage key={pose} mediaRef={p.uri} style={styles.photo} label={`${pose} photo, ${day(c.dueDate)}`} /> : null;
              })}
            </ScrollView>
          </View>
        ))
      )}
      <Text variant="caption" color="ink2" style={[styles.body, { paddingTop: space[3] }]}>
        Photos are private to you and {firstName}.
      </Text>
      <PreviousList history={history} current={s} />
    </Screen>
  );
}

function PreviousList({ history, current }: { history: CheckInSubmission[]; current: CheckInSubmission }) {
  const older = history.filter((c) => c.id !== current.id).reverse();
  if (!older.length) return null;
  return (
    <>
      <SectionLabel>Earlier check-ins</SectionLabel>
      {older.map((c) => (
        <View key={c.id} style={{ paddingHorizontal: margin }}>
          <Button label={`Due ${day(c.dueDate)}`} kind="quiet" full={false} onPress={() => router.replace(`/check-in/${c.id}`)} />
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  body: { paddingHorizontal: margin, paddingTop: space[3], gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 48 },
  quote: { borderLeftWidth: 3, paddingLeft: space[3], gap: 2, marginTop: space[2] },
  photo: { width: 96, height: 128, borderRadius: radius.control },
});
