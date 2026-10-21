import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  applySetToAll,
  emptySet,
  findExercise,
  fromDisplay,
  toDisplay,
  updateExercise,
  uuidv7,
  type LoadType,
  type ProgramExerciseDef,
  type ProgramSet,
} from '@spotter/core';
import { Button, EmptyState, IconButton, ListRow, Screen, SectionLabel, SegmentedControl, Stepper, Text, TextField, useTheme, margin, space } from '@spotter/ui';
import { useEditing, useLibrary, usePrograms } from '../../../../src/programs';
import { ExercisePicker, NumberField } from '../../../../src/programUi';
import { tenant } from '../../../../src/env';

const unit = tenant.units;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Set prescription for one exercise: sets × reps (or range), load, RPE, rest, tempo, notes, alternatives, progression rule. */
export default function ExerciseEditor() {
  const { id, peId } = useLocalSearchParams<{ id: string; peId: string }>();
  const { colors } = useTheme();
  const library = useLibrary();
  const { program } = useEditing(id);
  const change = usePrograms((s) => s.change);
  const [picker, setPicker] = useState<'swap' | 'alt' | null>(null);
  const found = program ? findExercise(program, peId) : null;

  if (!program || !found) {
    return (
      <Screen>
        <View style={styles.nav}>
          <IconButton icon="arrow-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/programs'))} />
        </View>
        <EmptyState message="This exercise was removed from the session." actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const e = found.exercise;
  const update = (fn: (x: ProgramExerciseDef) => ProgramExerciseDef) => change(id, updateExercise(program, e.id, fn));
  const setSet = (i: number, patch: Partial<ProgramSet>) => update((x) => ({ ...x, sets: x.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const repsBased = e.metric === 'weight_reps' || e.metric === 'bodyweight_reps';
  const loadType: LoadType = e.sets[0]?.loadType ?? (e.metric === 'weight_reps' ? 'absolute' : 'bodyweight');

  const setLoadType = (t: LoadType) =>
    update((x) => ({
      ...x,
      trackRpe: t === 'rpe' ? true : x.trackRpe,
      sets: x.sets.map((s) => ({ ...s, loadType: t, loadValue: t === s.loadType ? s.loadValue : t === 'pct_1rm' ? 0.75 : null, rpe: t === 'rpe' ? (s.rpe ?? 8) : s.rpe })),
    }));

  return (
    <Screen footer={<Button label="Done" onPress={() => router.back()} />}>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back to the session" onPress={() => router.back()} />
      </View>
      <View style={styles.head}>
        <Text variant="label" color="ink2">
          {found.day.title || 'Session'}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {e.name}
        </Text>
        <Button label="Swap for another exercise" kind="quiet" icon="repeat" full={false} onPress={() => setPicker('swap')} />
      </View>

      {e.metric === 'weight_reps' ? (
        <View style={styles.block}>
          <Text variant="label" color="ink2">
            Load
          </Text>
          <SegmentedControl<LoadType>
            label="Load"
            value={loadType}
            onChange={setLoadType}
            options={[
              { value: 'absolute', label: unit },
              { value: 'pct_1rm', label: '% 1RM' },
              { value: 'rpe', label: 'RPE' },
            ]}
          />
          <Text variant="caption" color="ink2">
            {loadType === 'pct_1rm'
              ? 'Worked out from each client’s best logged set. Clients with no history yet pick their own weight.'
              : loadType === 'rpe'
                ? 'Clients pick a weight that feels like the target RPE.'
                : `The same weight for every client, in ${unit}.`}
          </Text>
        </View>
      ) : null}

      <SectionLabel>{`${e.sets.length} set${e.sets.length === 1 ? '' : 's'}`}</SectionLabel>
      {e.sets.map((s, i) => (
        <View key={i} style={[styles.setRow, { borderBottomColor: colors.line }]}>
          <View style={styles.setHead}>
            <Text variant="figure" style={{ width: 28 }}>
              {i + 1}
            </Text>
            {repsBased ? (
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: s.amrap }}
                accessibilityLabel={`Set ${i + 1} as many reps as possible`}
                onPress={() => setSet(i, { amrap: !s.amrap })}
                style={[styles.amrap, { borderColor: s.amrap ? colors.ink : colors.line, backgroundColor: s.amrap ? colors.ink : 'transparent' }]}
              >
                <Text variant="label" style={{ color: s.amrap ? colors.paper : colors.ink2 }}>
                  AMRAP
                </Text>
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }} />
            <IconButton icon="x" label={`Remove set ${i + 1}`} onPress={() => update((x) => ({ ...x, sets: x.sets.filter((_, j) => j !== i) }))} />
          </View>
          <View style={styles.fields}>
            {repsBased && !s.amrap ? (
              <>
                <NumberField label="Reps from" value={s.repsMin} decimals={false} onChange={(v) => setSet(i, { repsMin: v })} />
                <NumberField label="to" value={s.repsMax} decimals={false} onChange={(v) => setSet(i, { repsMax: v })} />
              </>
            ) : null}
            {e.metric === 'time' ? <NumberField label="Seconds" value={s.durationS} decimals={false} onChange={(v) => setSet(i, { durationS: v })} /> : null}
            {e.metric === 'distance' ? <NumberField label="Metres" value={s.distanceM} onChange={(v) => setSet(i, { distanceM: v })} /> : null}
            {e.metric === 'weight_reps' && s.loadType === 'absolute' ? (
              <NumberField
                label={`Weight (${unit})`}
                value={s.loadValue == null ? null : round2(toDisplay(s.loadValue, unit))}
                onChange={(v) => setSet(i, { loadValue: v == null ? null : fromDisplay(v, unit) })}
              />
            ) : null}
            {e.metric === 'weight_reps' && s.loadType === 'pct_1rm' ? (
              <NumberField
                label="% of 1RM"
                value={s.loadValue == null ? null : Math.round(s.loadValue * 1000) / 10}
                onChange={(v) => setSet(i, { loadValue: v == null ? null : v / 100 })}
              />
            ) : null}
            {repsBased ? <NumberField label={s.loadType === 'rpe' ? 'Target RPE' : 'RPE (optional)'} value={s.rpe} onChange={(v) => setSet(i, { rpe: v })} /> : null}
          </View>
        </View>
      ))}
      <View style={[styles.block, styles.row2]}>
        <View style={{ flex: 1 }}>
          <Button
            label="Add a set"
            icon="plus"
            kind="secondary"
            onPress={() => update((x) => ({ ...x, sets: [...x.sets, x.sets.length ? { ...x.sets[x.sets.length - 1]! } : emptySet(x.metric)] }))}
          />
        </View>
        {e.sets.length > 1 ? (
          <View style={{ flex: 1 }}>
            <Button label="Use set 1 for all" kind="quiet" onPress={() => update((x) => applySetToAll(x, 0))} />
          </View>
        ) : null}
      </View>

      <SectionLabel>Details</SectionLabel>
      <View style={styles.block}>
        <View style={styles.row2}>
          <NumberField
            label="Rest after (seconds)"
            value={e.restS}
            decimals={false}
            onChange={(v) => update((x) => ({ ...x, restS: Math.max(0, Math.min(900, v ?? 0)) }))}
          />
          <View style={{ flex: 1 }}>
            <TextField label="Tempo (optional)" value={e.tempo ?? ''} onChangeText={(t) => update((x) => ({ ...x, tempo: t.trim() ? t.slice(0, 12) : null }))} placeholder="e.g. 3-1-1" />
          </View>
        </View>
        {e.supersetGroup ? (
          <Text variant="caption" color="ink2">
            In superset {e.supersetGroup}: only the last exercise in the superset needs rest.
          </Text>
        ) : null}
        <TextField label="Coaching cue (optional)" value={e.note ?? ''} onChangeText={(t) => update((x) => ({ ...x, note: t || null }))} placeholder="e.g. Brace before you unrack" multiline />
        {repsBased ? (
          <View style={styles.toggle}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Ask for RPE</Text>
              <Text variant="callout" color="ink2">
                Clients can rate how hard each set felt (optional for them).
              </Text>
            </View>
            <Switch
              value={e.trackRpe}
              onValueChange={(trackRpe) => update((x) => ({ ...x, trackRpe }))}
              accessibilityLabel="Ask for RPE"
              trackColor={{ true: colors.brand, false: colors.line }}
              thumbColor={colors.surface}
              {...{ activeThumbColor: colors.surface }}
            />
          </View>
        ) : null}
      </View>

      <SectionLabel>Approved alternatives</SectionLabel>
      {e.alternatives.length === 0 ? (
        <Text color="ink2" style={styles.block}>
          None. Add swaps the client can choose when equipment is taken.
        </Text>
      ) : (
        e.alternatives.map((a, i) => (
          <ListRow
            key={a.exerciseId}
            title={a.name}
            last={i === e.alternatives.length - 1}
            right={<IconButton icon="x" label={`Remove ${a.name}`} onPress={() => update((x) => ({ ...x, alternatives: x.alternatives.filter((y) => y.exerciseId !== a.exerciseId) }))} />}
          />
        ))
      )}
      <View style={styles.block}>
        <Button label="Add an alternative" icon="plus" kind="quiet" full={false} onPress={() => setPicker('alt')} />
      </View>

      {repsBased ? (
        <>
          <SectionLabel>Progression rule</SectionLabel>
          <View style={styles.block}>
            <View style={styles.toggle}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">Suggest a heavier load</Text>
                <Text variant="callout" color="ink2">
                  When the client hits the top of the rep range on every set. They see it as “Suggested — your coach approved this rule” and can keep the current load.
                </Text>
              </View>
              <Switch
                value={!!e.progressionRule}
                onValueChange={(on) =>
                  update((x) => ({ ...x, progressionRule: on ? { id: uuidv7(), maxRpe: 8, sessionsRequired: 2, incrementKg: fromDisplay(tenant.weightIncrement, unit) } : null }))
                }
                accessibilityLabel="Suggest a heavier load"
                trackColor={{ true: colors.brand, false: colors.line }}
                thumbColor={colors.surface}
                {...{ activeThumbColor: colors.surface }}
              />
            </View>
            {e.progressionRule ? (
              <>
                <View style={styles.row2}>
                  <NumberField
                    label={`Add (${unit})`}
                    value={round2(toDisplay(e.progressionRule.incrementKg, unit))}
                    onChange={(v) => v && v > 0 && update((x) => ({ ...x, progressionRule: x.progressionRule && { ...x.progressionRule, incrementKg: fromDisplay(v, unit) } }))}
                  />
                  <NumberField
                    label="At RPE or easier"
                    value={e.progressionRule.maxRpe}
                    placeholder="Any"
                    onChange={(v) => update((x) => ({ ...x, progressionRule: x.progressionRule && { ...x.progressionRule, maxRpe: v == null ? null : Math.max(1, Math.min(10, v)) } }))}
                  />
                </View>
                <Stepper
                  label="Sessions in a row"
                  value={e.progressionRule.sessionsRequired}
                  step={1}
                  min={1}
                  max={5}
                  onChange={(n) => update((x) => ({ ...x, progressionRule: x.progressionRule && { ...x.progressionRule, sessionsRequired: n } }))}
                />
                <Text variant="callout" color="ink2">
                  {`+${round2(toDisplay(e.progressionRule.incrementKg, unit))} ${unit} when the top of the range is hit${
                    e.progressionRule.maxRpe != null ? ` at ≤ RPE ${e.progressionRule.maxRpe}` : ''
                  } for ${e.progressionRule.sessionsRequired} session${e.progressionRule.sessionsRequired === 1 ? '' : 's'}.`}
                </Text>
              </>
            ) : null}
          </View>
        </>
      ) : null}

      <ExercisePicker
        visible={picker != null}
        title={picker === 'swap' ? `Swap ${e.name} for…` : 'Add an approved alternative'}
        library={library}
        exclude={[e.exerciseId, ...e.alternatives.map((a) => a.exerciseId)]}
        onClose={() => setPicker(null)}
        onPick={(ex) => {
          if (picker === 'swap') {
            update((x) => ({
              ...x,
              exerciseId: ex.id,
              name: ex.name,
              metric: ex.metric,
              // A different kind of exercise (e.g. carry → squat) needs a fresh prescription.
              sets: ex.metric === x.metric ? x.sets : x.sets.map(() => emptySet(ex.metric)),
              progressionRule: ex.metric === x.metric ? x.progressionRule : null,
            }));
          } else {
            update((x) => ({ ...x, alternatives: [...x.alternatives, { exerciseId: ex.id, name: ex.name }] }));
          }
          setPicker(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[2], alignItems: 'flex-start' },
  block: { paddingHorizontal: margin, paddingTop: space[3], gap: space[3] },
  setRow: { paddingHorizontal: margin, paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  amrap: { borderWidth: 1, borderRadius: 4, paddingHorizontal: space[3], minHeight: 44, justifyContent: 'center' },
  row2: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56 },
});
