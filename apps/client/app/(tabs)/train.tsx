import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  IMPORTED_ACTIVITY_LABEL,
  WEEKDAY_SHORT,
  addDays,
  consistencyText,
  dayFor,
  formatDuration,
  mondayOf,
  trendText,
  volumeKg,
  weekMinutes,
  type ImportedWorkout,
} from '@spotter/core';
import { isoDay } from '@spotter/core/demo';
import { EmptyState, ListRow, MiniBars, Screen, ScreenHeader, SectionLabel, Skeleton, Tag, Text, useTheme, fonts, margin, radius, space } from '@spotter/ui';
import { shortDate, w } from '../../src/format';
import { todayPlan, useApp, type CompletedSession } from '../../src/store';
import { useAssigned } from '../../src/programs';
import { useHealthImports, visibleWorkouts } from '../../src/health/store';
import { importedSessions } from '../../src/health/loads';
import { useProgress } from '../../src/brief/progress';
import { useWins } from '../../src/wins/useWins';
import { useMobility } from '../../src/mobility/store';
import { mobilityFromImported } from '@spotter/core';
import { localDate } from '../../src/nutrition/store';
import { calibrationSessions } from '../../src/cycle/store';

type Row = { kind: 'session'; at: string; s: CompletedSession } | { kind: 'workout'; at: string; w: ImportedWorkout };

/** "Run · 5.2 km · from Apple Watch". */
function workoutLine(x: ImportedWorkout): string {
  const parts = [x.distanceM ? `${Math.round(x.distanceM / 100) / 10} km` : null, `${Math.round(x.durationMin)} min`, x.sourceApp ? `from ${x.sourceApp}` : null];
  return parts.filter(Boolean).join(' · ');
}

/**
 * Train (docs/ux/client-experience.md): this week's program, then Progress (wins incl. masters weekly wins,
 * consistency, trends), mobility, then History (logged and imported in one list).
 */
export default function Train() {
  const hydrated = useApp((s) => s.hydrated);
  const completed = useApp((s) => s.completed);
  const workouts = useHealthImports((s) => s.workouts);
  const hidden = useHealthImports((s) => s.hiddenActivities);
  const origin = useHealthImports((s) => s.origin);
  const imported = importedSessions(visibleWorkouts(workouts, hidden), completed).map((x) => x.workout);
  const rows: Row[] = [
    ...completed.map((s) => ({ kind: 'session' as const, at: s.startedAt, s })),
    ...imported.map((x) => ({ kind: 'workout' as const, at: x.startedAt, w: x })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const { consistency } = useProgress();

  if (!hydrated) {
    return (
      <Screen>
        <ScreenHeader title="Train" />
        <View style={{ paddingHorizontal: margin, gap: space[3] }}>
          <Skeleton height={64} />
          <Skeleton height={120} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Train" subtitle={consistency.done ? consistencyText(consistency) : 'Your sessions, progress and history'} />
      <ThisWeek completed={completed} imported={imported} />
      <ProgressBlock />
      <MobilityRow />

      <SectionLabel>History</SectionLabel>
      {rows.length === 0 ? (
        <EmptyState message="No sessions yet. Your first one will show up here." actionLabel="Go to Today" onAction={() => router.push('/today')} />
      ) : (
        rows.slice(0, 40).map((item, index, arr) =>
          item.kind === 'session' ? (
            <ListRow
              key={item.s.sessionId}
              title={`${item.s.title} · ${shortDate(item.s.date)}`}
              subtitle={`${item.s.sets.length} sets · ${formatDuration((Date.parse(item.s.finishedAt) - Date.parse(item.s.startedAt)) / 1000)} · ${w(volumeKg(item.s.sets))}`}
              right={item.s.variant === 'lighter' ? <Tag label="Easier version" /> : item.s.variant === 'recovery' ? <Tag label="Recovery" /> : undefined}
              chevron
              last={index === arr.length - 1}
              onPress={() => router.push(`/history/${item.s.sessionId}`)}
            />
          ) : (
            <ListRow
              key={`w-${item.w.id}`}
              title={`${IMPORTED_ACTIVITY_LABEL[item.w.activity]} · ${shortDate(item.w.date)}`}
              subtitle={workoutLine(item.w)}
              right={<Tag label={origin === 'mock' ? 'Sample' : 'Imported'} />}
              last={index === arr.length - 1}
            />
          ),
        )
      )}
      {rows.length ? (
        <Text variant="caption" color="ink2" style={{ paddingHorizontal: margin, paddingTop: space[3] }}>
          {imported.length && origin === 'mock' ? 'Last 30 days are available offline. Imported workouts here are sample data.' : 'Last 30 days are available offline. Workouts from your watch show here too.'}
        </Text>
      ) : null}
    </Screen>
  );
}

/** Mon–Sun with what's planned, done and today. Words under each mark, so nothing depends on colour. */
function ThisWeek({ completed, imported }: { completed: CompletedSession[]; imported: ImportedWorkout[] }) {
  const { colors } = useTheme();
  const assignment = useAssigned((s) => s.assignment);
  const todayMode = useApp((s) => s.demo.todayMode);
  const today = isoDay(0);
  const monday = mondayOf(today);
  const doneDates = new Set(calibrationSessions(completed).map((s) => s.date));
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const doneHere = completed.filter((s) => s.date === date);
    // Same sessions Progress counts (in the demo, the MOCK history too), so the week and the streak agree.
    const loggedHere = doneDates.has(date);
    const importedHere = imported.filter((x) => x.date === date);
    let planned: string | null = null;
    if (assignment) {
      const d = dayFor(assignment, date);
      if (d.kind === 'session') planned = d.day.title;
    } else if (date === today) {
      planned = todayPlan(todayMode)?.title ?? null;
    }
    if (date === today && todayMode !== 'session') planned = null;
    return { date, label: WEEKDAY_SHORT[i]!, planned, done: doneHere[0]?.title ?? (loggedHere ? 'Session' : null), extra: importedHere[0] ? IMPORTED_ACTIVITY_LABEL[importedHere[0].activity] : null, isToday: date === today, past: date < today };
  });
  const plannedCount = days.filter((d) => d.planned).length;
  const doneCount = days.filter((d) => d.done).length;
  const summary = plannedCount ? `${doneCount} of ${plannedCount} sessions done this week` : `${doneCount} session${doneCount === 1 ? '' : 's'} this week`;
  return (
    <View>
      <SectionLabel>This week</SectionLabel>
      <View style={styles.block}>
        <View style={styles.week} accessible accessibilityLabel={`${summary}. ${days.map((d) => `${d.label}: ${d.done ? `${d.done}, done` : d.planned ? `${d.planned}${d.isToday ? ', today' : d.past ? ', not done' : ''}` : d.extra ? d.extra : 'rest'}`).join('. ')}`}>
          {days.map((d) => {
            const state = d.done ? 'done' : d.planned ? (d.isToday ? 'today' : d.past ? 'missed' : 'planned') : d.extra ? 'extra' : 'rest';
            return (
              <View key={d.date} style={styles.dayCol}>
                <Text variant="caption" color={d.isToday ? 'ink' : 'ink2'} style={d.isToday ? { fontFamily: fonts.semibold } : null}>
                  {d.label}
                </Text>
                <View
                  style={[
                    styles.mark,
                    state === 'done' && { backgroundColor: colors.ink, borderColor: colors.ink },
                    state === 'today' && { borderColor: colors.brand, borderWidth: 2.5 },
                    state === 'planned' && { borderColor: colors.ink2 },
                    state === 'missed' && { borderColor: colors.line, borderStyle: 'dashed' },
                    state === 'extra' && { borderColor: colors.ink2, backgroundColor: colors.line },
                    state === 'rest' && { borderColor: 'transparent' },
                  ]}
                >
                  {state === 'done' ? <Feather name="check" size={16} color={colors.paper} /> : state === 'rest' ? <View style={[styles.dot, { backgroundColor: colors.line }]} /> : null}
                </View>
                <Text variant="caption" color="ink2" numberOfLines={1} style={{ fontSize: 11 }}>
                  {state === 'done' ? 'Done' : state === 'today' ? 'Today' : state === 'planned' ? (d.planned ?? '') : state === 'missed' ? 'Not done' : state === 'extra' ? d.extra : ''}
                </Text>
              </View>
            );
          })}
        </View>
        <Text variant="callout" color="ink2">
          {summary}
        </Text>
      </View>
    </View>
  );
}

/** Progress at the top of Train: the latest win (shareable), consistency drawn, the clearest trend. */
function ProgressBlock() {
  const { colors } = useTheme();
  const wins = useWins();
  const { trends, consistency } = useProgress();
  const win = wins[0];
  const trend = trends.find((t) => t.slopePct != null) ?? trends[0];
  const counts = consistency.weeks.map((x) => x.done);
  const planned = consistency.weeks[consistency.weeks.length - 1]?.planned ?? consistency.planned;
  return (
    <View>
      <SectionLabel
        right={
          <Pressable onPress={() => router.push('/progress')} accessibilityRole="link" hitSlop={8}>
            <Text variant="callout" style={{ color: colors.brand, fontFamily: fonts.semibold }}>
              See all
            </Text>
          </Pressable>
        }
      >
        Progress
      </SectionLabel>
      <View style={[styles.block, { gap: space[4] }]}>
        {win ? (
          <View style={[styles.win, { borderColor: colors.line, backgroundColor: colors.surface }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Feather name="award" size={16} color={colors.brand} />
              <Text variant="label" color="ink2">{`This week’s win · ${shortDate(win.date)}`}</Text>
            </View>
            <Text style={styles.winText}>{win.text}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
              <Pressable onPress={() => router.push({ pathname: '/share-win', params: { id: win.id } })} accessibilityRole="button" accessibilityLabel={`Share: ${win.text}`} hitSlop={8} style={styles.inlineBtn}>
                <Feather name="share" size={16} color={colors.brand} />
                <Text variant="bodyStrong" style={{ color: colors.brand }}>
                  Share
                </Text>
              </Pressable>
              {wins.length > 1 ? (
                <Pressable onPress={() => router.push('/progress')} accessibilityRole="link" hitSlop={8} style={styles.inlineBtn}>
                  <Text variant="callout" color="ink2">{`${wins.length - 1} more win${wins.length === 2 ? '' : 's'}`}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : (
          <Text variant="callout" color="ink2">
            No wins yet this week. More reps at a weight, a steady month or a faster session all count.
          </Text>
        )}
        {counts.some((c) => c > 0) ? (
          <View style={{ gap: space[1] }}>
            <Text variant="bodyStrong">Sessions per week</Text>
            <MiniBars
              values={counts}
              reference={planned ?? null}
              emphasis={(i) => i === counts.length - 1}
              height={56}
              label={`Sessions in each of the last ${counts.length} weeks, oldest first: ${counts.join(', ')}.${planned ? ` Planned: ${planned} a week.` : ''}`}
            />
            <Text variant="caption" color="ink2">
              {`Last ${counts.length} weeks, this week on the right${planned ? ` · dashed line: ${planned} planned a week` : ''}`}
            </Text>
          </View>
        ) : null}
        {trend ? <Text variant="callout">{trendText(trend)}</Text> : null}
      </View>
    </View>
  );
}

function MobilityRow() {
  const logs = useMobility((s) => s.logs);
  const workouts = useHealthImports((s) => s.workouts);
  const imported = workouts.map(mobilityFromImported).filter((x): x is NonNullable<typeof x> => !!x);
  const week = weekMinutes([...logs, ...imported], localDate());
  return (
    <View>
      <SectionLabel>Mobility</SectionLabel>
      <ListRow
        title={week.total ? `${week.total} min this week` : 'None this week yet'}
        subtitle="Log stretching, yoga or your coach’s routine"
        chevron
        last
        onPress={() => router.push('/mobility')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { paddingHorizontal: margin, paddingTop: space[3], gap: space[3] },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', gap: space[1], width: 44 },
  mark: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  win: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.sheet, padding: space[4], gap: space[2] },
  winText: { fontFamily: fonts.title, fontSize: 24, lineHeight: 28 },
  inlineBtn: { flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: 36 },
});
