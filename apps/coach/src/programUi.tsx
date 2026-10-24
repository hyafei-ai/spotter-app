import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { searchLibrary, WEEKDAY_SHORT, type ExerciseMetric, type LibraryExercise } from '@spotter/core';
import { ListRow, Sheet, Tag, Text, TextField, useTheme, margin, space } from '@spotter/ui';

export const METRIC_OPTIONS: { value: ExerciseMetric; label: string }[] = [
  { value: 'weight_reps', label: 'Weight × reps' },
  { value: 'bodyweight_reps', label: 'Reps' },
  { value: 'time', label: 'Time' },
  { value: 'distance', label: 'Distance' },
];

/** Numeric input that keeps what's typed (e.g. "82.") until it parses; empty means null. */
export function NumberField({
  label,
  value,
  onChange,
  decimals = true,
  placeholder,
  width,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  decimals?: boolean;
  placeholder?: string;
  width?: number;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value == null ? '' : String(value));
  return (
    <View style={width ? { width } : { flex: 1 }}>
      <TextField
        label={label}
        value={shown}
        placeholder={placeholder}
        keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
        inputMode={decimals ? 'decimal' : 'numeric'}
        onChangeText={(t) => {
          setText(t);
          const clean = t.replace(',', '.').trim();
          if (clean === '') return onChange(null);
          const n = Number(clean);
          if (Number.isFinite(n)) onChange(decimals ? n : Math.round(n));
        }}
        onBlur={() => setText(null)}
      />
    </View>
  );
}

/** Horizontal filter chips (one selected or none). */
export function Chips<T extends string>({ label, options, value, onChange, inset = false }: { label: string; options: { value: T; label: string }[]; value: T | null; onChange: (v: T | null) => void; inset?: boolean }) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipsScroll}
      contentContainerStyle={[styles.chips, inset && { paddingHorizontal: 0 }]}
      accessibilityLabel={label}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${label}: ${o.label}`}
            onPress={() => onChange(on ? null : o.value)}
            style={[styles.chip, { borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.ink : 'transparent' }]}
          >
            <Text variant="callout" style={{ color: on ? colors.paper : colors.ink }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Mon–Sun picker; taken days are shown but can't be picked. */
export function WeekdayPicker({ value, taken, onChange }: { value: number | null; taken: number[]; onChange: (d: number) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.week} accessibilityRole="radiogroup" accessibilityLabel="Day of the week">
      {WEEKDAY_SHORT.map((d, i) => {
        const day = i + 1;
        const on = day === value;
        const disabled = taken.includes(day) && !on;
        return (
          <Pressable
            key={d}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled }}
            accessibilityLabel={disabled ? `${d}, already has a session` : d}
            disabled={disabled}
            onPress={() => onChange(day)}
            style={[
              styles.weekday,
              { borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.ink : 'transparent', opacity: disabled ? 0.4 : 1 },
            ]}
          >
            <Text variant="bodyStrong" style={{ color: on ? colors.paper : colors.ink }}>
              {d.slice(0, 2)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Library search in a sheet; used to add an exercise or pick an approved alternative. */
export function ExercisePicker({
  visible,
  title,
  library,
  exclude = [],
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  library: LibraryExercise[];
  exclude?: string[];
  onPick: (e: LibraryExercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const results = searchLibrary(library, query).filter((e) => !exclude.includes(e.id));
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <View style={{ paddingHorizontal: margin, paddingBottom: space[2] }}>
        <TextField label="Search exercises" value={query} onChangeText={setQuery} placeholder="e.g. squat, row, carry" autoCorrect={false} />
      </View>
      <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
        {results.length === 0 ? (
          <Text color="ink2" style={{ padding: margin }}>
            Nothing matches “{query}”. Add it as your own exercise from Programs → Library.
          </Text>
        ) : (
          results.map((e, i) => (
            <ListRow
              key={e.id}
              title={e.name}
              subtitle={e.equipment.join(', ')}
              right={e.isCustom ? <Tag label="Yours" /> : undefined}
              last={i === results.length - 1}
              onPress={() => {
                setQuery('');
                onPick(e);
              }}
            />
          ))
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chipsScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: margin, gap: space[2], paddingVertical: space[2], alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: space[4], minHeight: 40, justifyContent: 'center' },
  week: { flexDirection: 'row', gap: space[1] },
  weekday: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
