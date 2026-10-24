import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { RaceGoal, SIM_DIVISIONS, SIM_DIVISION_LABEL, addDays, formatRaceTime, parseTimeInput } from '@spotter/core';
import { isoDay } from '@spotter/core/demo';
import { Button, IconButton, Screen, SegmentedControl, Skeleton, Text, TextField, useTheme, useToast, margin, space } from '@spotter/ui';
import { longDate } from '../src/format';
import { tenant } from '../src/env';
import { useMyRaceGoal } from '../src/race/store';

/** Me → Race goal (docs/ux/multisport.md 5.11): set, change or remove your race. Your coach sees it. */
export default function RaceGoalScreen() {
  const { goal, loaded, save } = useMyRaceGoal();
  const toast = useToast();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/me'));
  if (!loaded) {
    return (
      <Screen>
        <View style={{ padding: margin, gap: space[3] }}>
          <Skeleton width="50%" height={28} />
          <Skeleton height={56} />
        </View>
      </Screen>
    );
  }
  return (
    <Form
      key={goal ? 'set' : 'new'}
      initial={goal}
      back={back}
      onSave={async (g) => {
        await save(g);
        toast({ message: g ? `Saved. ${tenant.coach.name.split(' ')[0]} sees your race.` : 'Race goal removed.' });
        back();
      }}
    />
  );
}

function Form({ initial, back, onSave }: { initial: RaceGoal | null; back: () => void; onSave: (g: RaceGoal | null) => Promise<void> }) {
  const { colors } = useTheme();
  const today = isoDay(0);
  const [event, setEvent] = useState(initial?.event ?? '');
  const [date, setDate] = useState(initial?.date ?? addDays(today, 56));
  const [kind, setKind] = useState<RaceGoal['kind']>(initial?.kind ?? 'run');
  const [format, setFormat] = useState<'full' | 'half'>(initial?.format ?? 'full');
  const [division, setDivision] = useState<RaceGoal['division']>(initial?.division ?? null);
  const [target, setTarget] = useState(initial?.targetSec ? formatRaceTime(initial.targetSec) : '');
  const targetSec = target.trim() ? parseTimeInput(target) : null;
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));
  const goal: RaceGoal = { event: event.trim(), kind, date, targetSec: targetSec ?? null, division: kind === 'race_sim' ? division : null, format: kind === 'race_sim' ? format : null };
  const missing = !event.trim() ? 'Name the race' : !dateOk ? 'Pick a date' : target.trim() && targetSec == null ? 'Write the target like 45:00' : undefined;
  const chip = (label: string, on: boolean, onPress: () => void) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, { borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.ink : 'transparent' }]}
    >
      <Text variant="callout" style={{ color: on ? colors.paper : colors.ink }}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <Screen
      footer={
        <>
          <Button label="Save race goal" disabled={!!missing || !RaceGoal.safeParse(goal).success} disabledReason={missing} onPress={() => void onSave(goal)} />
          {initial ? <Button label="Remove the race goal" kind="quiet" onPress={() => void onSave(null)} /> : null}
        </>
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Race goal
        </Text>
        <Text variant="callout" color="ink2">
          {`Today shows a countdown in the last 12 weeks. ${tenant.coach.name.split(' ')[0]} sees it too.`}
        </Text>
      </View>
      <View style={styles.body}>
        <TextField label="Race" value={event} onChangeText={setEvent} placeholder="e.g. City 10 km" maxLength={80} />
        <Text variant="label" color="ink2">
          Kind
        </Text>
        <SegmentedControl
          label="Kind of race"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'run', label: 'Running' },
            { value: 'race_sim', label: 'Race sim' },
            { value: 'other', label: 'Other' },
          ]}
        />
        <Text variant="label" color="ink2">
          {`Date · ${dateOk ? longDate(date) : 'not set'}`}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {[4, 8, 12, 16].map((w) => chip(`In ${w} weeks`, date === addDays(today, w * 7), () => setDate(addDays(today, w * 7))))}
        </ScrollView>
        <TextField label="Or a date" value={date} onChangeText={setDate} placeholder="2027-03-20" hint="Year-month-day" autoCorrect={false} />
        {kind === 'race_sim' ? (
          <>
            <SegmentedControl label="Format" value={format} onChange={setFormat} options={[{ value: 'full', label: 'Full' }, { value: 'half', label: 'Half' }]} />
            <Text variant="label" color="ink2">
              Division (optional)
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {SIM_DIVISIONS.map((d) => chip(SIM_DIVISION_LABEL[d], division === d, () => setDivision(division === d ? null : d)))}
            </ScrollView>
          </>
        ) : null}
        <TextField label="Target time (optional)" value={target} onChangeText={setTarget} placeholder="45:00" hint="Leave it empty to just finish" autoCorrect={false} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  body: { paddingHorizontal: margin, paddingTop: space[4], gap: space[3] },
  chips: { gap: space[2] },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: space[4], minHeight: 40, justifyContent: 'center' },
});
