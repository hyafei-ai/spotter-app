import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SAMPLE_CLIENT } from '@spotter/core/demo';
import {
  Button,
  IconButton,
  Monogram,
  Screen,
  ScreenHeader,
  Skeleton,
  Tag,
  Text,
  useTheme,
  useToast,
  margin,
  space,
} from '@spotter/ui';
import { initials } from '../../src/store';
import { useFirstRunPreview, useLighterWords } from '../../src/today/data';
import { useToday, type TodayRow } from '../../src/today/useToday';
import { useOfferEasier, useOpenMessage } from '../../src/today/actions';
import { useTodayDone } from '../../src/today/store';

const MAX = 3;

/**
 * The coach's home (docs/ux/coach-experience.md): who needs you today and exactly why, each with the one
 * thing to do. Act today → Check in → Celebrate. No charts here; they live on each client's page.
 */
export default function Today() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ firstrun?: string }>();
  // Demo/screenshot entry: /today?firstrun=1 shows the first-login state (Me → Demo toggles it too).
  const setPreview = useFirstRunPreview((s) => s.setPreview);
  const [seenParam, setSeenParam] = useState<string | undefined>(undefined);
  if (params.firstrun !== seenParam) {
    setSeenParam(params.firstrun);
    if (params.firstrun === '1' || params.firstrun === '0') setPreview(params.firstrun === '1');
  }

  const t = useToday();
  const offer = useOfferEasier();
  const message = useOpenMessage();
  const lighter = useLighterWords();
  const toast = useToast();
  const undo = useTodayDone((s) => s.undo);

  const onAction = (r: TodayRow) => {
    if (r.action.type === 'easier')
      return offer.open(r.client, r.action.item, r.key, lighter(r.client.id));
    if (r.action.type === 'open') return router.push(`/client/${r.client.id}`);
    if (r.action.type === 'message')
      return message(r.client, r.action.draft, { done: r.key, checkIn: r.action.checkIn?.reason });
    return message(r.client, r.action.draft, { done: r.key });
  };

  const date = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const allGood = t.act.length === 0 && t.checkIn.length === 0 && t.checkInStatus === 'ready';
  // One primary per screen: Invite on first login, otherwise the first item's button.
  const primaryKey = t.firstRun ? null : (t.act[0] ?? t.checkIn[0] ?? t.celebrate[0])?.key;

  return (
    <Screen>
      <ScreenHeader
        title="Today"
        subtitle={date}
        right={
          <IconButton
            icon="user-plus"
            label="Invite a client"
            onPress={() => router.push('/invite')}
          />
        }
      />

      {t.firstRun ? (
        <View
          style={[styles.firstRun, { borderColor: colors.line, backgroundColor: colors.surface }]}
        >
          <Text variant="headline">This is what you’ll see for every client.</Text>
          <Text variant="callout" color="ink2">
            {`Spotter puts each client’s training, sleep, HRV, food and cycle in one place, and shows what works for them. ${SAMPLE_CLIENT.name.split(' ')[0]} is a sample with made-up data (MOCK).`}
          </Text>
          <View style={{ gap: space[2], marginTop: space[2] }}>
            <Button
              label="Invite your first client"
              icon="user-plus"
              onPress={() => router.push('/invite')}
            />
            <Button
              label="Open the sample client"
              kind="quiet"
              onPress={() => router.push(`/client/${SAMPLE_CLIENT.id}`)}
            />
          </View>
        </View>
      ) : null}

      {allGood && !t.firstRun ? (
        <View style={styles.allGood}>
          <Text variant="title">All good today.</Text>
          <Text variant="callout" color="ink2">
            Nobody needs easing off or a check-in.{' '}
            {t.celebrate.length ? 'Here’s who’s doing great.' : ''}
          </Text>
        </View>
      ) : (
        <>
          <Group
            title="Act today"
            hint="Today’s session meets a strain signal"
            rows={t.act}
            empty="Nobody’s session needs changing today."
            primaryKey={primaryKey}
            onAction={onAction}
          />
          <Group
            title="Check in"
            hint="Who could use a conversation, and why"
            rows={t.checkIn}
            empty={
              t.firstRun
                ? 'Clients who go quiet or flag something show up here.'
                : 'Nobody needs a check-in right now.'
            }
            loading={t.checkInStatus === 'loading'}
            error={t.checkInStatus === 'error' ? t.retry : undefined}
            primaryKey={primaryKey}
            onAction={onAction}
          />
        </>
      )}
      <Group
        title={allGood && !t.firstRun ? 'Doing great' : 'Celebrate'}
        hint="Wins worth telling them about, beyond PRs"
        rows={t.celebrate}
        empty="No new wins this week yet."
        primaryKey={primaryKey}
        onAction={onAction}
      />

      {t.waiting.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Also waiting on you: ${t.waiting.join(', ')}. Opens Clients, Needs you.`}
          onPress={() => router.push('/clients?filter=needs')}
          style={({ pressed }) => [
            styles.waiting,
            { borderTopColor: colors.line, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label" color="ink2">
              Also waiting on you
            </Text>
            <Text variant="callout">{t.waiting.join(' · ')}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.ink2} />
        </Pressable>
      ) : null}

      {t.done.length ? (
        <View style={[styles.done, { borderTopColor: colors.line }]}>
          <Text variant="label" color="ink2">{`Done today · ${t.done.length}`}</Text>
          {t.done.map((d) => (
            <View key={d.key} style={styles.doneRow}>
              <Feather name="check" size={16} color={colors.success} />
              <Text variant="callout" style={{ flex: 1 }}>
                <Text variant="callout" style={{ fontWeight: '600' }}>
                  {d.client.name.split(' ')[0]}
                </Text>
                <Text variant="callout" color="ink2">{` · ${d.what}`}</Text>
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Put ${d.client.name.split(' ')[0]} back on today’s list`}
                hitSlop={12}
                onPress={() => {
                  undo(d.key);
                  toast({ message: 'Back on today’s list.' });
                }}
              >
                <Text variant="caption" color="ink2">
                  Undo
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {offer.sheet}
    </Screen>
  );
}

function Group({
  title,
  hint,
  rows,
  empty,
  loading,
  error,
  primaryKey,
  onAction,
}: {
  title: string;
  hint: string;
  rows: TodayRow[];
  empty: string;
  loading?: boolean;
  error?: () => void;
  primaryKey: string | null | undefined;
  onAction: (r: TodayRow) => void;
}) {
  const { colors } = useTheme();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, MAX);
  return (
    <View style={[styles.group, { borderTopColor: colors.line }]}>
      <View
        style={styles.groupHead}
        accessibilityRole="header"
        accessibilityLabel={`${title}, ${loading ? 'loading' : rows.length}`}
      >
        <Text variant="title" style={{ flex: 1 }}>
          {title}
        </Text>
        {!loading ? (
          <Text variant="title" color={rows.length ? 'ink' : 'ink2'} tabular>
            {rows.length}
          </Text>
        ) : null}
      </View>
      <Text variant="caption" color="ink2" style={styles.hint}>
        {hint}
      </Text>
      {loading ? (
        <View style={{ paddingHorizontal: margin, gap: space[3], paddingTop: space[2] }}>
          <Skeleton height={40} />
          <Skeleton height={40} />
        </View>
      ) : error ? (
        <View
          style={{
            paddingHorizontal: margin,
            gap: space[2],
            paddingTop: space[2],
            alignItems: 'flex-start',
          }}
        >
          <Text color="ink2">Couldn’t load who to check in with. Check your connection.</Text>
          <Button label="Try again" kind="quiet" icon="refresh-cw" full={false} onPress={error} />
        </View>
      ) : rows.length === 0 ? (
        <Text variant="callout" color="ink2" style={styles.empty}>
          {empty}
        </Text>
      ) : (
        <>
          {shown.map((r, i) => (
            <Item
              key={r.key}
              row={r}
              primary={r.key === primaryKey}
              last={i === shown.length - 1}
              onAction={() => onAction(r)}
            />
          ))}
          {rows.length > MAX ? (
            <View style={{ paddingHorizontal: margin }}>
              <Button
                label={all ? 'Show fewer' : `See all ${rows.length}`}
                kind="quiet"
                full={false}
                onPress={() => setAll(!all)}
              />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function Item({
  row,
  primary,
  last,
  onAction,
}: {
  row: TodayRow;
  primary: boolean;
  last: boolean;
  onAction: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.item,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${row.client.name}${row.sample ? ', sample client' : ''}. ${row.line}. Opens their page.`}
        onPress={() => router.push(`/client/${row.client.id}`)}
        style={({ pressed }) => [styles.itemMain, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Monogram initials={initials(row.client.name)} size={36} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.nameRow}>
            <Text variant="bodyStrong">{row.client.name}</Text>
            {row.sample ? <Tag label="Sample" /> : null}
          </View>
          <Text variant="callout">{row.line}</Text>
        </View>
      </Pressable>
      <View style={styles.itemAction}>
        <Button
          label={row.label}
          kind={primary ? 'primary' : 'secondary'}
          full={false}
          onPress={onAction}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  firstRun: {
    marginHorizontal: margin,
    marginBottom: space[2],
    padding: space[4],
    gap: space[2],
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  allGood: {
    paddingHorizontal: margin,
    paddingTop: space[4],
    paddingBottom: space[2],
    gap: space[1],
  },
  group: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: space[4], paddingTop: space[3] },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: margin,
    gap: space[2],
  },
  hint: { paddingHorizontal: margin, paddingBottom: space[1] },
  empty: { paddingHorizontal: margin, paddingVertical: space[2] },
  item: { marginHorizontal: margin, paddingVertical: space[3], gap: space[2] },
  itemMain: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  itemAction: { paddingLeft: 36 + space[3], alignItems: 'flex-start' },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    marginTop: space[6],
    paddingTop: space[3],
    paddingHorizontal: margin,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  done: {
    marginTop: space[4],
    paddingTop: space[3],
    paddingHorizontal: margin,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: space[2],
  },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 32 },
});
