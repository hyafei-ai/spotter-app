import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MOBILITY_KIND_LABEL, type MobilityKind } from '@spotter/core';
import { Button, SectionLabel, SegmentedControl, Text, margin, space } from '@spotter/ui';
import { tenant } from '../env';
import { localDate } from '../nutrition/store';
import { useMobility } from './store';

/** What one tap logs: the coach's suggested routine on a rest day, else 10 minutes of stretching. */
export interface MobilitySuggestion {
  title: string;
  minutes: number;
  routineId: string | null;
}

const MINUTES = ['5', '10', '15', '20', '30', '45'] as const;
const KINDS: { value: MobilityKind; label: string }[] = [
  { value: 'stretching', label: 'Stretch' },
  { value: 'routine', label: 'Routine' },
  { value: 'yoga', label: 'Yoga' },
  { value: 'pilates', label: 'Pilates' },
  { value: 'other', label: 'Other' },
];

const line = (minutes: number, kind: MobilityKind, title?: string) => `${minutes} min · ${kind === 'routine' && title ? title : MOBILITY_KIND_LABEL[kind]}`;

/**
 * "Did mobility?" on Today's rest-day and done views (docs/ux/mobility-capture.md): one tap logs the
 * suggestion; "Something else" opens minutes and type. Logged today shows with an undo.
 */
export function MobilityLog({ suggestion }: { suggestion?: MobilitySuggestion }) {
  const logs = useMobility((s) => s.logs);
  const log = useMobility((s) => s.log);
  const remove = useMobility((s) => s.remove);
  const first = tenant.coach.name.split(' ')[0] ?? '';
  const today = localDate();
  const todays = logs.filter((l) => l.date === today);
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState<(typeof MINUTES)[number]>('10');
  const quick = suggestion ?? { title: 'Stretching', minutes: 10, routineId: null };
  const quickKind: MobilityKind = suggestion?.routineId ? 'routine' : 'stretching';
  const [kind, setKind] = useState<MobilityKind>(quickKind);
  const [saving, setSaving] = useState(false);

  const save = async (m: number, k: MobilityKind, routineId: string | null) => {
    setSaving(true);
    try {
      await log({ minutes: m, kind: k, routineId });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <SectionLabel>Mobility</SectionLabel>
      <View style={styles.body}>
        {todays.map((l) => (
          <View key={l.id} style={styles.logged}>
            <Text style={{ flex: 1 }}>{`Done today: ${line(l.minutes, l.kind, l.routineId === suggestion?.routineId ? suggestion?.title : undefined)}`}</Text>
            <Button label="Undo" kind="quiet" full={false} accessibilityLabel={`Undo ${line(l.minutes, l.kind)}`} onPress={() => void remove(l.id)} />
          </View>
        ))}
        {todays.length === 0 ? (
          <Text color="ink2">{`Did mobility today? ${first} sees it with your sessions.`}</Text>
        ) : null}
        {!open && todays.length === 0 ? (
          <View style={styles.actions}>
            <Button label={`Log ${line(quick.minutes, quickKind, quick.title)}`} kind="secondary" icon="check" loading={saving} onPress={() => void save(quick.minutes, quickKind, quick.routineId)} />
            <Button label="Something else" kind="quiet" onPress={() => setOpen(true)} />
          </View>
        ) : !open ? (
          <Button label="Log more" kind="quiet" onPress={() => setOpen(true)} />
        ) : (
          <View style={{ gap: space[3] }}>
            <Text variant="label" color="ink2">
              Minutes
            </Text>
            <SegmentedControl label="Minutes" value={minutes} onChange={setMinutes} options={MINUTES.map((m) => ({ value: m, label: m }))} />
            <Text variant="label" color="ink2">
              What
            </Text>
            <SegmentedControl label="Type of mobility" value={kind} onChange={setKind} options={KINDS} />
            <Button label={`Log ${line(Number(minutes), kind)}`} kind="secondary" loading={saving} onPress={() => void save(Number(minutes), kind, kind === 'routine' ? (suggestion?.routineId ?? null) : null)} />
            <Button label="Cancel" kind="quiet" onPress={() => setOpen(false)} />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: margin, paddingTop: space[3], gap: space[3], paddingBottom: space[2] },
  logged: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  actions: { gap: space[1] },
});
