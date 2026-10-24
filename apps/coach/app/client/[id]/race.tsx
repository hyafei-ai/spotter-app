import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { RaceGoal, SIM_DIVISIONS, SIM_DIVISION_LABEL, addDays, formatRaceTime, parseTimeInput } from '@spotter/core';
import { isoDay } from '@spotter/core/demo';
import { Button, IconButton, Screen, SegmentedControl, Text, TextField, useToast, margin, space } from '@spotter/ui';
import { useCoach } from '../../../src/store';
import { Chips } from '../../../src/programUi';
import { longDate } from '../../../src/format';
import { useRaceGoal } from '../../../src/multisport/race';

/** Set a client's race (docs/ux/multisport.md 5.11): event, date, kind, format and division, target. */
export default function RaceGoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const client = useCoach((s) => s.clients.find((c) => c.id === id));
  const { goal, loaded, save } = useRaceGoal(id);
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/client/${id}`));
  if (!loaded) return <Screen>{null}</Screen>;
  return <Form key={goal ? 'set' : 'new'} initial={goal} first={client?.name.split(' ')[0] ?? 'Client'} back={back} onSave={async (g) => {
    await save(g);
    toast({ message: g ? 'Race goal saved.' : 'Race goal removed.' });
    back();
  }} />;
}

function Form({ initial, first, back, onSave }: { initial: RaceGoal | null; first: string; back: () => void; onSave: (g: RaceGoal | null) => Promise<void> }) {
  const today = isoDay(0);
  const [event, setEvent] = useState(initial?.event ?? '');
  const [date, setDate] = useState(initial?.date ?? addDays(today, 56));
  const [kind, setKind] = useState<RaceGoal['kind']>(initial?.kind ?? 'race_sim');
  const [format, setFormat] = useState<'full' | 'half'>(initial?.format ?? 'full');
  const [division, setDivision] = useState<RaceGoal['division']>(initial?.division ?? null);
  const [target, setTarget] = useState(initial?.targetSec ? formatRaceTime(initial.targetSec) : '');
  const targetSec = target.trim() ? parseTimeInput(target) : null;
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
  const goal: RaceGoal = { event: event.trim(), kind, date, targetSec: targetSec ?? null, division: kind === 'race_sim' ? division : null, format: kind === 'race_sim' ? format : null };
  const valid = RaceGoal.safeParse(goal).success && dateOk && (target.trim() === '' || targetSec != null);
  const missing = !event.trim() ? 'Name the race' : !dateOk ? 'Pick a date' : target.trim() && targetSec == null ? 'Write the target like 1:25:00' : undefined;

  return (
    <Screen
      footer={
        <>
          <Button label="Save race goal" disabled={!valid} disabledReason={missing} onPress={() => void onSave(goal)} />
          {initial ? <Button label="Remove the race goal" kind="quiet" onPress={() => void onSave(null)} /> : null}
        </>
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="label" color="ink2">
          {first}
        </Text>
        <Text variant="title" accessibilityRole="header">
          Race goal
        </Text>
      </View>
      <View style={styles.body}>
        <TextField label="Race" value={event} onChangeText={setEvent} placeholder="e.g. Spring race, Manchester" maxLength={80} />
        <Text variant="label" color="ink2">
          Kind
        </Text>
        <SegmentedControl
          label="Kind of race"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'race_sim', label: 'Race sim' },
            { value: 'run', label: 'Running' },
            { value: 'other', label: 'Other' },
          ]}
        />
        <Text variant="label" color="ink2">
          {`Date · ${dateOk ? longDate(date) : 'not set'}`}
        </Text>
        <Chips
          inset
          label="When"
          options={[4, 8, 12, 16].map((w) => ({ value: addDays(today, w * 7), label: `In ${w} weeks` }))}
          value={date}
          onChange={(d) => d && setDate(d)}
        />
        <TextField label="Or a date" value={date} onChangeText={setDate} placeholder="2027-03-20" hint="Year-month-day" autoCorrect={false} />
        {kind === 'race_sim' ? (
          <>
            <Text variant="label" color="ink2">
              Format
            </Text>
            <SegmentedControl label="Format" value={format} onChange={setFormat} options={[{ value: 'full', label: 'Full' }, { value: 'half', label: 'Half' }]} />
            <Text variant="label" color="ink2">
              Division (optional)
            </Text>
            <Chips inset label="Division" options={SIM_DIVISIONS.map((d) => ({ value: d, label: SIM_DIVISION_LABEL[d] }))} value={division} onChange={setDivision} />
          </>
        ) : null}
        <TextField label="Target time (optional)" value={target} onChangeText={setTarget} placeholder="1:25:00" hint="Leave empty to just finish" autoCorrect={false} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  body: { paddingHorizontal: margin, paddingTop: space[4], gap: space[3] },
});
