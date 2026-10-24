import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import {
  BLOCK_KIND_LABEL,
  CHECK_STANDARD,
  INTERVAL_MODALITIES,
  MODALITY_LABEL,
  SCORING_LABEL,
  blockKindLine,
  blockLabel,
  blockProblems,
  dayBlocks,
  findDay,
  formatRaceTime,
  fromDisplay,
  movementInLibrary,
  movementLine,
  newMovement,
  newWorkoutBlock,
  parseTimeInput,
  removeDayBlock,
  searchLibrary,
  toDisplay,
  updateDay,
  updateDayBlock,
  type Block,
  type BlockKind,
  type BlockMovement,
  type BlockOf,
  type ScoringMode,
} from '@spotter/core';
import { Banner, Button, EmptyState, IconButton, ListRow, Screen, SectionLabel, SegmentedControl, Sheet, Tag, Text, TextField, useTheme, useToast, margin, space } from '@spotter/ui';
import { useEditing, useLibrary, usePrograms } from '../../../../src/programs';
import { Chips, NumberField } from '../../../../src/programUi';
import { tenant } from '../../../../src/env';

/** Kinds a WOD block can switch between, keeping its movements. */
const WOD_KINDS: BlockKind[] = ['for_time', 'rounds_for_time', 'amrap', 'emom', 'rep_scheme', 'tabata', 'interval_amrap'];

const SCORING_FOR: Partial<Record<BlockKind, ScoringMode[]>> = {
  for_time: ['time', 'reps', 'none'],
  rounds_for_time: ['time', 'none'],
  rep_scheme: ['time', 'none'],
  amrap: ['rounds_reps', 'reps', 'calories', 'none'],
  interval_amrap: ['rounds_reps', 'reps', 'none'],
  emom: ['none', 'reps', 'load'],
  tabata: ['reps', 'none'],
  intervals: ['time', 'distance', 'none'],
  station_race: ['time', 'none'],
  timed: ['none', 'distance', 'calories'],
};

/** Switching kind keeps the name, note and movements; timing comes from the new kind's defaults. */
function convert(b: Block, kind: BlockKind): Block {
  const next = newWorkoutBlock(kind);
  const keep = { id: b.id, title: b.title, note: b.note, templateId: null };
  const movements = 'movements' in b ? b.movements : [];
  return { ...next, ...keep, ...('movements' in next ? { movements: kind === 'rep_scheme' ? movements.map((m) => ({ ...m, reps: null })) : movements } : {}) } as Block;
}

/** One part of a session: timing, movements, how it's scored (docs/ux/multisport.md 5.3). */
export default function BlockEditor() {
  const { id, blockId, day: dayId } = useLocalSearchParams<{ id: string; blockId: string; day: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const { program } = useEditing(id);
  const { change } = usePrograms();
  const [editing, setEditing] = useState<{ index: number; m: BlockMovement } | null>(null);
  const found = program && dayId ? findDay(program, dayId) : null;
  const block = found ? dayBlocks(found.day).find((b) => b.id === blockId) : null;
  const back = () => (router.canGoBack() ? router.back() : router.replace(`/program/${encodeURIComponent(id)}/day/${dayId}`));

  if (!program || !found || !block) {
    return (
      <Screen>
        <View style={styles.nav}>
          <IconButton icon="arrow-left" label="Back" onPress={back} />
        </View>
        <EmptyState message="This part was removed." actionLabel="Back to the session" onAction={back} />
      </Screen>
    );
  }

  const set = (fn: (b: Block) => Block) => change(id, updateDay(program, found.day.id, (d) => updateDayBlock(d, block.id, fn)));
  const patch = (p: Partial<Block>) => set((b) => ({ ...b, ...p }) as Block);
  const problems = blockProblems(block);
  const unit = tenant.units;
  const movements: BlockMovement[] | null = block.kind === 'station_race' ? block.segments : 'movements' in block ? block.movements : null;
  const setMovements = (ms: BlockMovement[]) =>
    set((b) => (b.kind === 'station_race' ? { ...b, segments: ms.map((m, i) => ({ ...m, kind: b.segments[i]?.kind ?? (m.movementId === 'run' ? 'run' : 'station') })) } : 'movements' in b ? ({ ...b, movements: ms } as Block) : b));

  return (
    <Screen footer={<Button label="Done" onPress={back} />}>
      <View style={styles.nav}>
        <IconButton icon="arrow-left" label="Back to the session" onPress={back} />
      </View>
      <View style={styles.head}>
        <Text variant="label" color="ink2">
          {`${found.day.title || 'Session'} · ${blockKindLine(block)}`}
        </Text>
        <Text variant="title" accessibilityRole="header">
          {blockLabel(block)}
        </Text>
      </View>

      {problems.length ? (
        <View accessibilityRole="alert" style={[styles.problems, { borderLeftColor: colors.warning, backgroundColor: colors.surface }]}>
          {problems.map((p) => (
            <Text key={p} variant="callout">
              {p}
            </Text>
          ))}
        </View>
      ) : null}

      {movements?.some((m) => m.verify) ? (
        <View style={{ paddingTop: space[3] }}>
          <Banner tone="warning" message={`${CHECK_STANDARD}. These race loads and distances came from a template.`} />
          <View style={styles.body}>
            <Button
              label="I’ve checked them"
              kind="quiet"
              onPress={() => {
                setMovements(movements.map((m) => ({ ...m, verify: false })));
                toast({ message: 'Marked as checked.' });
              }}
            />
          </View>
        </View>
      ) : null}

      {WOD_KINDS.includes(block.kind) ? (
        <>
          <SectionLabel>Format</SectionLabel>
          <Chips label="Format" options={WOD_KINDS.map((k) => ({ value: k, label: BLOCK_KIND_LABEL[k] }))} value={block.kind} onChange={(k) => k && k !== block.kind && set((b) => convert(b, k))} />
        </>
      ) : null}

      <View style={styles.body}>
        {block.kind !== 'note' && block.kind !== 'rest' ? (
          <TextField label="Name (optional)" value={block.title ?? ''} onChangeText={(t) => patch({ title: t.trim() ? t.slice(0, 60) : null })} placeholder={block.kind === 'amrap' ? 'e.g. Cindy' : block.kind === 'intervals' ? 'e.g. Threshold kilometres' : 'e.g. Fran'} />
        ) : null}
      </View>

      <SectionLabel>{block.kind === 'note' ? 'Note' : 'Timing'}</SectionLabel>
      <View style={[styles.body, { gap: space[3] }]}>
        <Timing block={block} set={set} />
      </View>

      {movements ? (
        <>
          <SectionLabel>{block.kind === 'station_race' ? `${movements.length} runs and stations` : `${movements.length} movement${movements.length === 1 ? '' : 's'}`}</SectionLabel>
          {movements.map((m, i) => (
            <ListRow
              key={m.id}
              title={block.kind === 'rep_scheme' ? m.name : movementLine(m, unit)}
              subtitle={[!movementInLibrary(m) ? 'Not in your library: logged by name' : null, m.verify ? CHECK_STANDARD : null, block.kind === 'emom' && block.rotate ? `Minute ${i + 1}` : null].filter(Boolean).join(' · ') || undefined}
              chevron
              last={i === movements.length - 1}
              onPress={() => setEditing({ index: i, m })}
            />
          ))}
          <View style={[styles.body, styles.row]}>
            {block.kind === 'station_race' ? (
              <>
                <View style={{ flex: 1 }}>
                  <Button label="Add a run" icon="plus" kind="quiet" onPress={() => setMovements([...movements, newMovement({ name: `Run ${movements.filter((x) => x.movementId === 'run').length + 1}`, movementId: 'run', distanceM: 1000 })])} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Add a station" icon="plus" kind="quiet" onPress={() => setEditing({ index: movements.length, m: newMovement({ name: 'Station' }) })} />
                </View>
              </>
            ) : (
              <Button label="Add a movement" icon="plus" kind="quiet" onPress={() => setEditing({ index: movements.length, m: newMovement({ name: 'Movement' }) })} />
            )}
          </View>
        </>
      ) : null}

      {SCORING_FOR[block.kind] ? (
        <>
          <SectionLabel>Scored by</SectionLabel>
          <Chips label="Scored by" options={SCORING_FOR[block.kind]!.map((s) => ({ value: s, label: SCORING_LABEL[s] }))} value={block.scoring} onChange={(s) => s && patch({ scoring: s })} />
          <Text variant="caption" color="ink2" style={styles.caption}>
            {block.scoring === 'none' ? 'The client marks it done; nothing to compare later.' : 'The client enters this after the clock stops; repeats compare with each other.'}
          </Text>
        </>
      ) : null}

      {block.kind !== 'note' && block.kind !== 'rest' ? (
        <View style={styles.body}>
          <TextField label="Note for the client (optional)" value={block.note ?? ''} onChangeText={(t) => patch({ note: t ? t.slice(0, 300) : null })} placeholder="e.g. Scale pull-ups to ring rows" multiline />
        </View>
      ) : null}

      <View style={styles.body}>
        <Button
          label="Remove this part"
          icon="trash-2"
          kind="quiet"
          onPress={() => {
            const before = program;
            change(id, updateDay(program, found.day.id, (d) => removeDayBlock(d, block.id)));
            toast({ message: 'Removed.', actionLabel: 'Undo', onAction: () => change(id, before) });
            back();
          }}
        />
      </View>

      {editing ? (
      <MovementSheet
        key={editing.m.id}
        initial={editing.m}
        unit={unit}
        onClose={() => setEditing(null)}
        onSave={(m) => {
          const next = [...movements!];
          next[editing!.index] = m;
          setMovements(next);
          setEditing(null);
        }}
        onRemove={
          editing && editing.index < (movements?.length ?? 0)
            ? () => {
                setMovements(movements!.filter((_, i) => i !== editing.index));
                setEditing(null);
              }
            : undefined
        }
      />
      ) : null}
    </Screen>
  );
}

/* ---------- timing fields per kind ---------- */

const minutesOf = (s: number | null) => (s == null ? null : Math.round((s / 60) * 100) / 100);
const secOf = (m: number | null) => (m == null ? null : Math.round(m * 60));

function Timing({ block: b, set }: { block: Block; set: (fn: (b: Block) => Block) => void }) {
  const p = <K extends BlockKind>(fields: Partial<BlockOf<K>>) => set((x) => ({ ...x, ...fields }) as Block);
  const cap = (
    <View style={styles.row}>
      <NumberField label="Time cap (min, optional)" value={minutesOf(b.timeCapSec)} onChange={(v) => p({ timeCapSec: v && v > 0 ? Math.max(10, secOf(v)!) : null })} />
    </View>
  );
  switch (b.kind) {
    case 'amrap':
      return (
        <View style={styles.row}>
          <NumberField label="Minutes" value={minutesOf(b.durationSec)} onChange={(v) => v && v > 0 && p<'amrap'>({ durationSec: Math.max(30, secOf(v)!) })} />
        </View>
      );
    case 'timed':
      return (
        <View style={styles.row}>
          <NumberField label="Minutes" value={minutesOf(b.durationSec)} onChange={(v) => v && v > 0 && p<'timed'>({ durationSec: Math.max(5, secOf(v)!) })} />
        </View>
      );
    case 'rest':
      return (
        <View style={styles.row}>
          <NumberField label="Seconds" value={b.durationSec} decimals={false} onChange={(v) => v && v >= 5 && p<'rest'>({ durationSec: v })} />
        </View>
      );
    case 'note':
      return <TextField label="Instructions" value={b.text} onChangeText={(text) => p<'note'>({ text: text.slice(0, 500) })} multiline placeholder="e.g. Warm up: 5 min easy row, then 2 rounds of…" />;
    case 'emom':
      return (
        <>
          <View style={styles.row}>
            <NumberField label="Every (seconds)" value={b.intervalSec} decimals={false} onChange={(v) => v && v >= 10 && p<'emom'>({ intervalSec: Math.min(600, v) })} />
            <NumberField label="Rounds" value={b.rounds} decimals={false} onChange={(v) => v && v >= 1 && p<'emom'>({ rounds: Math.min(120, v) })} />
          </View>
          <SegmentedControl
            label="Movements each minute"
            value={b.rotate ? 'rotate' : 'all'}
            onChange={(v) => p<'emom'>({ rotate: v === 'rotate' })}
            options={[
              { value: 'all', label: 'All every round' },
              { value: 'rotate', label: 'Take turns' },
            ]}
          />
        </>
      );
    case 'tabata':
    case 'interval_amrap':
      return (
        <View style={styles.row}>
          <NumberField label="Rounds" value={b.rounds} decimals={false} onChange={(v) => v && v >= 1 && p({ rounds: Math.min(40, v) })} />
          <NumberField label="Work (s)" value={b.workSec} decimals={false} onChange={(v) => v && v >= 5 && p({ workSec: v })} />
          <NumberField label="Rest (s)" value={b.restSec} decimals={false} onChange={(v) => v != null && v >= 0 && p({ restSec: v })} />
        </View>
      );
    case 'rounds_for_time':
      return (
        <>
          <View style={styles.row}>
            <NumberField label="Rounds" value={b.rounds} decimals={false} onChange={(v) => v && v >= 1 && p<'rounds_for_time'>({ rounds: Math.min(100, v) })} />
            <NumberField label="Rest between (s)" value={b.restSec} decimals={false} onChange={(v) => p<'rounds_for_time'>({ restSec: v && v > 0 ? v : null })} />
          </View>
          {cap}
        </>
      );
    case 'rep_scheme':
      return (
        <>
          <SchemeField value={b.scheme} onChange={(scheme) => p<'rep_scheme'>({ scheme })} />
          {cap}
        </>
      );
    case 'for_time':
      return cap;
    case 'intervals':
      return <IntervalsTiming b={b} p={(f) => p<'intervals'>(f)} />;
    case 'station_race':
      return (
        <Text variant="callout" color="ink2">
          One Done per run and per station, in order. The client’s splits are kept for each.
        </Text>
      );
    default:
      return null;
  }
}

function SchemeField({ value, onChange }: { value: number[]; onChange: (s: number[]) => void }) {
  const [text, setText] = useState(value.join('-'));
  const [error, setError] = useState<string | undefined>();
  return (
    <TextField
      label="Reps per round"
      value={text}
      error={error}
      placeholder="21-15-9"
      onChangeText={(t) => {
        setText(t);
        const xs = t.split(/[-,\s/]+/).filter(Boolean).map(Number);
        if (xs.length && xs.every((x) => Number.isInteger(x) && x > 0 && x <= 500) && xs.length <= 20) {
          setError(undefined);
          onChange(xs);
        } else setError('Write the reps with dashes, like 21-15-9');
      }}
    />
  );
}

type TargetKind = 'none' | 'pace' | 'hr_zone' | 'watts' | 'rpe';

function IntervalsTiming({ b, p }: { b: BlockOf<'intervals'>; p: (f: Partial<BlockOf<'intervals'>>) => void }) {
  const by = b.distanceM != null ? 'distance' : 'time';
  const target: TargetKind = b.target?.kind ?? 'none';
  const [pace, setPace] = useState(b.target?.kind === 'pace' ? formatRaceTime(b.target.secPerKm) : '');
  return (
    <>
      <Chips inset label="What" options={INTERVAL_MODALITIES.map((m) => ({ value: m, label: m === 'other' ? 'Other' : MODALITY_LABEL[m] }))} value={b.modality} onChange={(m) => m && p({ modality: m })} />
      <View style={styles.row}>
        <NumberField label="Reps" value={b.reps} decimals={false} onChange={(v) => v && v >= 1 && p({ reps: Math.min(60, v) })} />
        <NumberField label="Rest (s)" value={b.restSec} decimals={false} onChange={(v) => v != null && v >= 0 && p({ restSec: Math.min(1800, v) })} />
      </View>
      <SegmentedControl
        label="Each rep is"
        value={by}
        onChange={(v) => (v === 'distance' ? p({ distanceM: b.distanceM ?? 1000, workSec: null }) : p({ workSec: b.workSec ?? 60, distanceM: null }))}
        options={[
          { value: 'distance', label: 'A distance' },
          { value: 'time', label: 'A time' },
        ]}
      />
      <View style={styles.row}>
        {by === 'distance' ? (
          <NumberField label="Metres per rep" value={b.distanceM} onChange={(v) => v && v >= 1 && p({ distanceM: v })} />
        ) : (
          <NumberField label="Seconds per rep" value={b.workSec} decimals={false} onChange={(v) => v && v >= 5 && p({ workSec: v })} />
        )}
      </View>
      <Text variant="label" color="ink2">
        Target (optional)
      </Text>
      <Chips
        inset
        label="Target"
        options={[
          { value: 'none', label: 'None' },
          { value: 'pace', label: 'Pace' },
          { value: 'hr_zone', label: 'HR zone' },
          { value: 'watts', label: 'Watts' },
          { value: 'rpe', label: 'RPE' },
        ]}
        value={target}
        onChange={(k) => {
          if (!k || k === 'none') return p({ target: null });
          p({ target: k === 'pace' ? { kind: 'pace', secPerKm: 300 } : k === 'hr_zone' ? { kind: 'hr_zone', zone: 3 } : k === 'watts' ? { kind: 'watts', watts: 200 } : { kind: 'rpe', rpe: 8 } });
          if (k === 'pace') setPace('5:00');
        }}
      />
      {b.target?.kind === 'pace' ? (
        <TextField
          label="Pace per km"
          value={pace}
          placeholder="4:30"
          hint="Minutes:seconds per kilometre"
          onChangeText={(t) => {
            setPace(t);
            const s = parseTimeInput(t);
            if (s != null && s >= 60 && s <= 1200) p({ target: { kind: 'pace', secPerKm: s } });
          }}
        />
      ) : b.target?.kind === 'hr_zone' ? (
        <SegmentedControl label="Heart-rate zone" value={String(b.target.zone)} onChange={(z) => p({ target: { kind: 'hr_zone', zone: Number(z) } })} options={['1', '2', '3', '4', '5'].map((z) => ({ value: z, label: z }))} />
      ) : b.target?.kind === 'watts' ? (
        <View style={styles.row}>
          <NumberField label="Watts" value={b.target.watts} decimals={false} onChange={(v) => v && v >= 1 && p({ target: { kind: 'watts', watts: Math.min(2000, v) } })} />
        </View>
      ) : b.target?.kind === 'rpe' ? (
        <SegmentedControl label="RPE" value={String(b.target.rpe)} onChange={(r) => p({ target: { kind: 'rpe', rpe: Number(r) } })} options={['6', '7', '8', '9', '10'].map((r) => ({ value: r, label: r }))} />
      ) : null}
      {b.target?.kind === 'hr_zone' ? (
        <Text variant="caption" color="ink2">
          Zones come from each client’s own highest heart rate, never an age formula.
        </Text>
      ) : null}
    </>
  );
}

/* ---------- one movement ---------- */

function MovementSheet({
  initial,
  unit,
  onClose,
  onSave,
  onRemove,
}: {
  initial: BlockMovement;
  unit: 'kg' | 'lb';
  onClose: () => void;
  onSave: (m: BlockMovement) => void;
  onRemove?: () => void;
}) {
  const library = useLibrary();
  const { colors } = useTheme();
  const [cur, setM] = useState<BlockMovement>(initial);
  const [query, setQuery] = useState('');
  const matches = query.trim() ? searchLibrary(library, query).slice(0, 4) : [];
  const up = (p: Partial<BlockMovement>) => setM({ ...cur, ...p });
  const shown = (kg: number | null) => (kg == null ? null : Math.round(toDisplay(kg, unit) * 10) / 10);
  return (
    <Sheet visible title={cur.name} onClose={onClose}>
      {cur ? (
        <ScrollView style={{ maxHeight: 560 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: margin, gap: space[3] }}>
          <TextField
            label="Movement"
            value={query || cur.name}
            onChangeText={(t) => {
              setQuery(t);
              up({ name: t.slice(0, 60) || 'Movement', movementId: null });
            }}
            placeholder="e.g. thrusters, row, wall balls"
            autoCorrect={false}
          />
          {matches.length ? (
            <View>
              {matches.map((e, i) => (
                <ListRow
                  key={e.id}
                  title={e.name}
                  right={cur.movementId === e.id ? <Feather name="check" size={18} color={colors.brand} /> : <Tag label="Library" />}
                  last={i === matches.length - 1}
                  onPress={() => {
                    up({ name: e.name, movementId: e.id });
                    setQuery('');
                  }}
                />
              ))}
            </View>
          ) : null}
          <View style={styles.row}>
            <NumberField label="Reps" value={cur.reps} decimals={false} onChange={(v) => up({ reps: v })} />
            <NumberField label={`Load (${unit})`} value={shown(cur.loadKg)} onChange={(v) => up({ loadKg: v == null ? null : Math.round(fromDisplay(v, unit) * 10) / 10 })} />
          </View>
          <View style={styles.row}>
            <NumberField label="Calories" value={cur.calories} decimals={false} onChange={(v) => up({ calories: v })} />
            <NumberField label="Metres" value={cur.distanceM} onChange={(v) => up({ distanceM: v })} />
          </View>
          <TextField label="Note (optional)" value={cur.note ?? ''} onChangeText={(t) => up({ note: t ? t.slice(0, 120) : null })} placeholder="e.g. 24/20 in box, scale to step-ups" />
          <Button label="Save movement" onPress={() => onSave(cur)} />
          {onRemove ? <Button label="Remove movement" kind="quiet" onPress={onRemove} /> : null}
        </ScrollView>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space[2], paddingTop: space[2] },
  head: { paddingHorizontal: margin, gap: space[1] },
  body: { paddingHorizontal: margin, paddingTop: space[3] },
  row: { flexDirection: 'row', gap: space[3], alignItems: 'flex-start' },
  caption: { paddingHorizontal: margin },
  problems: { marginHorizontal: margin, marginTop: space[3], padding: space[3], borderLeftWidth: 3, borderRadius: 6, gap: 2 },
});
