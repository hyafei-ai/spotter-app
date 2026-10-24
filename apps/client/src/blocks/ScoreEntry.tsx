import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import {
  averagePace,
  formatRaceTime,
  fromDisplay,
  paceText,
  parseTimeInput,
  roundToIncrement,
  toDisplay,
  type Block,
  type BlockScore,
  type BlockSplit,
} from '@spotter/core';
import { SegmentedControl, Stepper, Text, TextField, useTheme, margin, space } from '@spotter/ui';
import { tenant } from '../env';

export interface ScoreDraft {
  score: BlockScore;
  rpe: number | null;
  valid: boolean;
  /** Why Save is off, in words. */
  problem?: string;
}

/**
 * Score entry that matches the block's scoring mode (docs/ux/multisport.md 5.9): a time (prefilled from the clock),
 * rounds + reps steppers (rounds prefilled from the taps), a load in the tenant's unit, reps, distance or calories.
 * Intervals and race sims show their splits; the clock already has them.
 */
export function ScoreEntry({ block, initial, splits, onChange }: { block: Block; initial: BlockScore; splits: BlockSplit[]; onChange: (d: ScoreDraft) => void }) {
  const [score, setScore] = useState<BlockScore>(initial);
  const [timeText, setTimeText] = useState(initial.timeSec ? formatRaceTime(initial.timeSec) : '');
  const [rpe, setRpe] = useState<number | null>(null);
  const unit = tenant.units;
  const cappable = block.timeCapSec != null && block.scoring === 'time';
  const rounds = block.kind === 'rounds_for_time' || block.kind === 'rep_scheme';

  const emit = (s: BlockScore, t: string, r: number | null) => {
    const parsed = t.trim() ? parseTimeInput(t) : null;
    const needsTime = block.scoring === 'time' && !s.capped && !['intervals', 'station_race'].includes(block.kind);
    const timeOk = !needsTime || (parsed != null && parsed > 0);
    const next = needsTime ? { ...s, timeSec: parsed } : s;
    onChange({ score: next, rpe: r, valid: timeOk, problem: timeOk ? undefined : 'Use m:ss, like 4:12' });
  };
  const up = (p: Partial<BlockScore>) => {
    const s = { ...score, ...p };
    setScore(s);
    emit(s, timeText, rpe);
  };

  const stepWeight = toDisplay(score.loadKg ?? 0, unit);
  const shownWeight = unit === 'kg' ? Math.round(stepWeight * 100) / 100 : roundToIncrement(stepWeight, tenant.weightIncrement);

  return (
    <View style={styles.wrap}>
      {block.scoring === 'time' && (block.kind === 'intervals' || block.kind === 'station_race') ? (
        <Splits block={block} splits={splits} total={score.timeSec} />
      ) : block.scoring === 'time' ? (
        <>
          {!score.capped ? (
            <TextField
              label="Your time"
              value={timeText}
              onChangeText={(t) => {
                setTimeText(t);
                emit(score, t, rpe);
              }}
              placeholder="4:12"
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
              error={timeText.trim() && parseTimeInput(timeText) == null ? 'Use m:ss, like 4:12' : undefined}
              style={styles.big}
            />
          ) : null}
          {cappable ? <Check label={`Hit the ${formatRaceTime(block.timeCapSec!)} time cap`} on={score.capped} onToggle={() => up({ capped: !score.capped, timeSec: null })} /> : null}
          {score.capped ? (
            <View style={styles.row}>
              {rounds ? <Stepper label="Rounds done" value={score.rounds ?? 0} step={1} max={100} unitLabel="rounds" onChange={(v) => up({ rounds: v })} /> : null}
              <CountField label={rounds ? '+ reps' : 'Reps done'} value={score.reps} max={2000} onChange={(v) => up({ reps: v })} />
            </View>
          ) : null}
        </>
      ) : block.scoring === 'rounds_reps' ? (
        <>
          <View style={styles.row}>
            <Stepper label="Rounds" value={score.rounds ?? 0} step={1} max={200} unitLabel="rounds" onChange={(v) => up({ rounds: v })} />
            <CountField label="+ reps" value={score.reps} max={500} onChange={(v) => up({ reps: v })} />
          </View>
          <PartialRound block={block} value={score.reps ?? 0} onPick={(reps) => up({ reps })} />
        </>
      ) : block.scoring === 'load' ? (
        <Stepper label={`Heaviest (${unit})`} value={shownWeight} step={tenant.weightIncrement} max={unit === 'kg' ? 500 : 1100} unitLabel={unit === 'kg' ? 'kilograms' : 'pounds'} onChange={(v) => up({ loadKg: fromDisplay(v, unit) })} />
      ) : block.scoring === 'reps' ? (
        <CountField label="Total reps" value={score.reps} max={10000} onChange={(v) => up({ reps: v })} />
      ) : block.scoring === 'distance' ? (
        <CountField label="Metres" value={score.distanceM} max={100000} onChange={(v) => up({ distanceM: v })} />
      ) : block.scoring === 'calories' ? (
        <CountField label="Calories" value={score.calories} max={2000} onChange={(v) => up({ calories: v })} />
      ) : (
        <Text color="ink2">Nothing to score: saving marks it done.</Text>
      )}

      {block.scoring !== 'none' ? <Check label="Scaled (not as written)" on={score.scaled} onToggle={() => up({ scaled: !score.scaled })} /> : null}

      <View style={{ gap: space[1] }}>
        <Text variant="label" color="ink2">
          How hard was it? (optional)
        </Text>
        <SegmentedControl
          label="How hard it felt, RPE out of 10"
          value={rpe != null ? String(rpe) : null}
          onChange={(v) => {
            const r = Number(v);
            setRpe(r);
            emit(score, timeText, r);
          }}
          options={['6', '7', '8', '9', '10'].map((v) => ({ value: v, label: v }))}
        />
      </View>
    </View>
  );
}

/**
 * An open-ended count (total reps, metres, calories): typed, because 140 reps is 3 keys, not 140 taps on a stepper.
 * The field keeps the client's text while they type; the score gets whole numbers only.
 */
function CountField({ label, value, max, onChange }: { label: string; value: number | null; max: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(value ? String(value) : '');
  // The partial-round chips set the value from outside; show it.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if ((Number(text) || 0) !== (value ?? 0)) setText(value ? String(value) : '');
  }
  const n = text.trim() === '' ? 0 : Number(text);
  const bad = !Number.isInteger(n) || n < 0 || n > max;
  return (
    <View style={{ flex: 1 }}>
      <TextField
        label={label}
        value={text}
        onChangeText={(t) => {
          setText(t);
          const v = t.trim() === '' ? 0 : Number(t);
          if (Number.isInteger(v) && v >= 0 && v <= max) onChange(v);
        }}
        placeholder="0"
        keyboardType="number-pad"
        autoCorrect={false}
        error={bad ? `A whole number up to ${max}` : undefined}
        style={styles.big}
      />
    </View>
  );
}

/**
 * "Where did you stop in the last round?": one tap instead of counting reps on the stepper. Each chip is the reps
 * done by the end of a movement (calories count as reps, the usual convention).
 */
function PartialRound({ block, value, onPick }: { block: Block; value: number; onPick: (reps: number) => void }) {
  const { colors } = useTheme();
  const ms = 'movements' in block ? block.movements : [];
  const each = ms.map((m) => m.reps ?? m.calories ?? 0);
  const stops = ms
    .map((m, i) => ({ name: m.name, reps: each.slice(0, i + 1).reduce((a, b) => a + b, 0), n: each[i]! }))
    .filter((x) => x.n > 0)
    .slice(0, -1);
  if (!stops.length) return null;
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="label" color="ink2">
        Stopped partway through a round?
      </Text>
      <View style={styles.chips}>
        {stops.map((x) => {
          const on = value === x.reps;
          return (
            <Pressable
              key={x.name}
              onPress={() => onPick(x.reps)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Finished the ${x.name.toLowerCase()}: plus ${x.reps} reps`}
              style={[styles.chip, { borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.ink : 'transparent' }]}
            >
              <Text variant="callout" style={{ color: on ? colors.paper : colors.ink }}>{`After ${x.name.toLowerCase()} · +${x.reps}`}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Check({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={styles.check} hitSlop={6}>
      <View style={[styles.box, { borderColor: on ? colors.brand : colors.ink2, backgroundColor: on ? colors.brand : 'transparent' }]}>
        {on ? <Feather name="check" size={16} color={colors.brandInk} /> : null}
      </View>
      <Text variant="body">{label}</Text>
    </Pressable>
  );
}

/** Interval reps or race segments as a log sheet: split, pace, and the average. */
function Splits({ block, splits, total }: { block: Block; splits: BlockSplit[]; total: number | null }) {
  const { colors } = useTheme();
  const pace = averagePace(splits);
  const modality = block.kind === 'intervals' ? block.modality : 'run';
  if (!splits.length) return <Text color="ink2">No splits recorded. Save to mark it done.</Text>;
  return (
    <View>
      <Text variant="figure" tabular>
        {block.kind === 'intervals' && pace != null ? `avg ${paceText(pace, modality)}` : formatRaceTime(total)}
      </Text>
      <Text variant="caption" color="ink2">
        {block.kind === 'intervals' ? `${splits.length} reps · ${formatRaceTime(total)} of work` : `${splits.length} splits`}
      </Text>
      <View style={{ marginTop: space[3] }}>
        {splits.map((s) => (
          <View key={s.index} style={[styles.split, { borderBottomColor: colors.line }]}>
            <Text variant="callout" style={{ flex: 1 }} numberOfLines={1}>
              {s.name}
            </Text>
            <Text variant="bodyStrong" tabular>
              {formatRaceTime(s.sec)}
            </Text>
            {s.distanceM && s.distanceM >= 150 && (s.kind === 'interval' || s.kind === 'run') ? (
              <Text variant="caption" color="ink2" tabular style={{ width: 84, textAlign: 'right' }}>
                {paceText((s.sec / s.distanceM) * 1000, modality)}
              </Text>
            ) : (
              <View style={{ width: 84 }} />
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: margin, gap: space[4] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  big: { fontSize: 28 },
  check: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: space[3], minHeight: 40, justifyContent: 'center' },
  split: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2], borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 44 },
});
