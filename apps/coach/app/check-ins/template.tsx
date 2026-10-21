import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { MEASUREMENTS, MEASUREMENT_LABEL, WEEKDAYS, type CheckInTemplate, type Measurement } from '@spotter/core';
import { Button, IconButton, Screen, SectionLabel, SegmentedControl, Text, useTheme, useToast, margin, space, touchMin } from '@spotter/ui';
import { useMedia } from '../../src/media/store';

type Toggle = 'bodyweight' | 'photos' | 'sleep' | 'stress' | 'adherence' | 'notes';
const TOGGLES: { key: Toggle; label: string; hint: string }[] = [
  { key: 'bodyweight', label: 'Bodyweight', hint: 'In the client’s units' },
  { key: 'photos', label: 'Progress photos', hint: 'Front, side, back · optional for the client, private to you both' },
  { key: 'sleep', label: 'Sleep', hint: 'Average hours a night' },
  { key: 'stress', label: 'Stress', hint: '1 to 5' },
  { key: 'adherence', label: 'How much of the plan they did', hint: 'All, most, some, not much' },
  { key: 'notes', label: 'Free text', hint: 'Anything else they want to say' },
];

/** Coach sets what the weekly check-in asks and when it's due (C-7). */
export default function CheckInTemplateScreen() {
  const { loaded, load, template } = useMedia();
  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);
  if (!loaded) return <Screen>{null}</Screen>;
  return <CheckInTemplateEditor initial={template} />;
}

function CheckInTemplateEditor({ initial }: { initial: CheckInTemplate }) {
  const { colors } = useTheme();
  const toast = useToast();
  const saveTemplate = useMedia((s) => s.saveTemplate);
  const [draft, setDraft] = useState<CheckInTemplate>(initial);
  const [dirty, setDirty] = useState(false);

  const update = (t: CheckInTemplate) => {
    setDraft(t);
    setDirty(true);
  };
  const toggleMeasure = (m: Measurement) =>
    update({
      ...draft,
      fields: {
        ...draft.fields,
        measurements: draft.fields.measurements.includes(m) ? draft.fields.measurements.filter((x) => x !== m) : [...draft.fields.measurements, m],
      },
    });
  const anything = TOGGLES.some((t) => draft.fields[t.key]) || draft.fields.measurements.length > 0;

  return (
    <Screen
      footer={
        <Button
          label="Save check-in"
          onPress={() => {
            void saveTemplate(draft);
            setDirty(false);
            toast({ message: 'Saved. Clients see it from their next check-in.' });
          }}
          disabled={!dirty || !anything}
          disabledReason={!anything ? 'Turn on at least one question.' : 'No changes yet'}
        />
      }
    >
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))} />
      </View>
      <View style={styles.head}>
        <Text variant="title" accessibilityRole="header">
          Weekly check-in
        </Text>
        <Text color="ink2">What clients answer each week. Fewer questions get answered more often.</Text>
      </View>

      <SectionLabel>Questions</SectionLabel>
      {TOGGLES.map((t) => (
        <View key={t.key} style={[styles.toggle, { borderBottomColor: colors.line }]}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{t.label}</Text>
            <Text variant="callout" color="ink2">
              {t.hint}
            </Text>
          </View>
          <Switch
            value={draft.fields[t.key]}
            onValueChange={(v) => update({ ...draft, fields: { ...draft.fields, [t.key]: v } })}
            accessibilityLabel={t.label}
            trackColor={{ true: colors.brand, false: colors.line }}
            thumbColor={colors.surface}
            {...{ activeThumbColor: colors.surface }}
          />
        </View>
      ))}

      <SectionLabel>Measurements (cm)</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {MEASUREMENTS.map((m) => {
          const on = draft.fields.measurements.includes(m);
          return (
            <Pressable
              key={m}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={MEASUREMENT_LABEL[m]}
              onPress={() => toggleMeasure(m)}
              style={[styles.chip, { borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.ink : 'transparent' }]}
            >
              <Text variant="bodyStrong" style={{ color: on ? colors.paper : colors.ink }}>
                {MEASUREMENT_LABEL[m]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <SectionLabel>Due every</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="radiogroup">
        {WEEKDAYS.map((d, i) => {
          const on = draft.dueWeekday === i;
          return (
            <Pressable
              key={d}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={d}
              onPress={() => update({ ...draft, dueWeekday: i })}
              style={[styles.chip, { borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.ink : 'transparent' }]}
            >
              <Text variant="bodyStrong" style={{ color: on ? colors.paper : colors.ink }}>
                {d.slice(0, 3)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <SectionLabel>Reminder that morning</SectionLabel>
      <View style={styles.body}>
        <SegmentedControl
          label="Reminder time"
          value={String(draft.reminderHour)}
          onChange={(v) => update({ ...draft, reminderHour: Number(v) })}
          options={['6', '7', '8', '9', '10'].map((h) => ({ value: h, label: `${h}:00` }))}
        />
        <Text variant="caption" color="ink2">
          Sent in each client’s own time zone, only if they haven’t checked in yet.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2] },
  body: { paddingHorizontal: margin, paddingTop: space[3], gap: space[2] },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: margin, paddingVertical: space[3], minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  chips: { paddingHorizontal: margin, paddingTop: space[3], gap: space[2] },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: space[4], minHeight: touchMin - 4, justifyContent: 'center' },
});
