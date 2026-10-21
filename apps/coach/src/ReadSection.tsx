import { StyleSheet, View } from 'react-native';
import { describeLighter, type ReadTone } from '@spotter/core';
import { ListRow, SectionLabel, SegmentedControl, Skeleton, Tag, Text, margin, space } from '@spotter/ui';
import { useCoach } from './store';
import { useLighterRule, useSharedReads } from './reads';

const TONE_LABEL: Record<ReadTone, string> = { steady: 'Steady', watch: 'Keep an eye on it', ease: 'Easier day' };
const TONE_TAG: Record<ReadTone, 'success' | 'warning' | 'brand'> = { steady: 'success', watch: 'warning', ease: 'brand' };
const VARIANT_LABEL = { lighter: 'Easier version', recovery: 'Recovery session', planned: 'As planned' } as const;

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const day = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

/** K-3 client detail → the client's shared daily read (read-only) and the coach's easier-version rule. */
export function ReadSection({ clientId }: { clientId: string }) {
  const client = useCoach((s) => s.clients.find((c) => c.id === clientId));
  const { loaded, entries, variants } = useSharedReads(clientId);
  const [rule, saveRule] = useLighterRule(clientId);
  const first = client?.name.split(' ')[0] ?? 'This client';
  const today = localDate(new Date());
  const latest = entries[entries.length - 1];
  const todays = latest?.date === today ? latest : undefined;

  if (!loaded) {
    return (
      <>
        <SectionLabel>Today’s read</SectionLabel>
        <View style={styles.body}>
          <Skeleton height={48} />
        </View>
      </>
    );
  }

  return (
    <>
      <SectionLabel>Today’s read</SectionLabel>
      <View style={styles.body}>
        {todays ? (
          todays.read ? (
            <View style={{ gap: space[1] }} accessibilityLabel={`${TONE_LABEL[todays.read.tone]}. ${todays.read.headline}`}>
              <Tag label={TONE_LABEL[todays.read.tone]} tone={TONE_TAG[todays.read.tone]} />
              <Text variant="callout">{todays.read.headline}</Text>
              {todays.read.factors.filter((f) => !todays.read!.headline.toLowerCase().includes(f.text.toLowerCase())).map((f) => (
                <Text key={f.kind} variant="caption" color="ink2">
                  {'· '}
                  {f.text}
                </Text>
              ))}
              <Text variant="caption" color="ink2">
                Shared by {first} at {time(todays.submittedAt)}
              </Text>
            </View>
          ) : (
            <Text variant="callout" color="ink2">
              {first} kept today’s read private. Checked in at {time(todays.submittedAt)}.
            </Text>
          )
        ) : (
          <Text variant="callout" color="ink2">
            {latest
              ? `No check-in yet today. Last one ${day(latest.date)}: ${latest.read ? latest.read.headline : 'kept private'}.`
              : `${first} hasn’t done a daily check yet.`}
          </Text>
        )}
      </View>
      {variants
        .slice(-3)
        .reverse()
        .map((v, i, arr) => (
          <ListRow key={`${v.date}-${i}`} title={`${VARIANT_LABEL[v.variant]} · ${v.title}`} subtitle={`${day(v.date)} · ${first} chose it from the read`} last={i === arr.length - 1} />
        ))}
      <View style={[styles.body, { gap: space[2] }]}>
        <Text variant="label" color="ink2">
          Easier version {first} can pick
        </Text>
        <SegmentedControl
          label="Lighter loads by"
          value={String(rule.loadPct)}
          onChange={(v) => void saveRule({ ...rule, loadPct: Number(v) })}
          options={[0, 5, 10, 15, 20].map((n) => ({ value: String(n), label: `${n}%` }))}
        />
        <SegmentedControl
          label="Fewer sets per exercise"
          value={String(rule.dropSets)}
          onChange={(v) => void saveRule({ ...rule, dropSets: Number(v) })}
          options={[0, 1, 2].map((n) => ({ value: String(n), label: n === 0 ? 'Same sets' : `−${n} set${n === 1 ? '' : 's'}` }))}
        />
        <Text variant="caption" color="ink2">
          {`Offered on days the read suggests easing off: ${describeLighter(rule).toLowerCase()}. ${first} always chooses.`}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: margin, paddingVertical: space[2] },
});
