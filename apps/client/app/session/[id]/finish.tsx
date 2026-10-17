import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatDuration, summarize } from '@spotter/core';
import { Button, ListRow, SectionLabel, SegmentedControl, Tally, Text, TextField, margin, space, useTheme, Screen } from '@spotter/ui';
import { SyncBanner } from '../../../src/SyncBanner';
import { w } from '../../../src/format';
import { useApp } from '../../../src/store';

const RECORD_LABEL = { heaviest: 'Heaviest set', e1rm: 'Best estimated 1RM', most_reps: 'Most reps' } as const;

/** C-4 finish: real numbers only, PRs only when there's earlier history to beat. */
export default function Finish() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { active, completed, finishSession } = useApp();
  const [feel, setFeel] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [finishedAt] = useState(() => new Date().toISOString());

  const session = active && active.sessionId === id ? active : null;
  const sum = useMemo(
    () => (session ? summarize(session.plan, session.sets, session.startedAt, finishedAt, completed.flatMap((s) => s.sets)) : null),
    [session, finishedAt, completed],
  );
  if (!session || !sum) return null;

  const finish = async () => {
    setSaving(true);
    await finishSession(feel ? Number(feel) : null, note.trim() || null);
    router.dismissAll();
    router.replace('/today');
  };

  const unloggedNames = [...new Set(sum.unlogged.map((u) => session.swaps[u.exercise.id]?.name ?? u.exercise.name))];

  return (
    <Screen
      banner={<SyncBanner />}
      footer={
        <>
          <Button label="Finish session" onPress={() => void finish()} loading={saving} />
          {sum.unlogged.length ? <Button label="Go back and log them" kind="quiet" onPress={() => router.back()} /> : null}
        </>
      }
    >
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          {session.plan.title}
        </Text>
        <View style={{ paddingVertical: space[2] }}>
          <Tally count={sum.setsLogged} />
        </View>
      </View>

      {sum.unlogged.length ? (
        <View accessibilityRole="alert" style={[styles.warn, { borderLeftColor: colors.warning, backgroundColor: colors.surface }]}>
          <Text variant="bodyStrong">
            {sum.unlogged.length} {sum.unlogged.length === 1 ? 'set isn’t' : 'sets aren’t'} logged
          </Text>
          <Text variant="callout" color="ink2">
            {unloggedNames.join(', ')}. Finish anyway if you skipped them.
          </Text>
        </View>
      ) : null}

      <View style={styles.stats}>
        <Stat label="Time" value={formatDuration(sum.durationS)} />
        <Stat label="Sets" value={`${sum.setsLogged} of ${sum.setsPlanned}`} />
        <Stat label="Volume" value={w(sum.volumeKg)} />
      </View>

      <SectionLabel>Personal records</SectionLabel>
      {sum.records.length ? (
        sum.records.map((r, i) => (
          <ListRow
            key={`${r.exerciseId}-${r.type}`}
            title={r.name}
            subtitle={`${RECORD_LABEL[r.type]}: ${r.type === 'most_reps' ? `${r.value} reps` : w(r.value)} (was ${r.type === 'most_reps' ? r.previous : w(r.previous)})`}
            last={i === sum.records.length - 1}
          />
        ))
      ) : (
        <Text color="ink2" style={styles.body}>
          None this time.
        </Text>
      )}

      <SectionLabel>How did it feel?</SectionLabel>
      <View style={[styles.body, { gap: space[4] }]}>
        <SegmentedControl
          label="How did it feel, 1 is very hard, 5 is great"
          value={feel}
          onChange={setFeel}
          options={['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }))}
        />
        <View style={styles.scale}>
          <Text variant="caption" color="ink2">
            1 · rough
          </Text>
          <Text variant="caption" color="ink2">
            5 · great
          </Text>
        </View>
        <TextField label="Note for your coach (optional)" value={note} onChangeText={setNote} multiline placeholder="Anything that felt off, or went well" />
      </View>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, minWidth: 96 }}>
      <Text variant="label" color="ink2">
        {label}
      </Text>
      <Text variant="figure" tabular>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: margin, paddingTop: space[6] },
  warn: { marginHorizontal: margin, marginTop: space[2], padding: space[3], borderLeftWidth: 3, borderRadius: 6, gap: 2 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: margin, paddingTop: space[5], gap: space[4] },
  body: { paddingHorizontal: margin, paddingTop: space[3] },
  scale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -space[3] },
});
