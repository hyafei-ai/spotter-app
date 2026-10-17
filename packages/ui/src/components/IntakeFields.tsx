import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { AnswerValue, IntakeQuestion } from '@spotter/core';
import { useTheme } from '../theme';
import { haptic } from '../haptics';
import { radius, space, touchMin } from '../tokens';
import { Text } from './Text';
import { TextField, SegmentedControl } from './Basics';

/**
 * Renders any intake question type. Shared by the client intake screen and the coach's preview,
 * so what the coach previews is exactly what the client gets.
 */
export function IntakeQuestionField({
  q,
  value,
  onChange,
  showError,
}: {
  q: IntakeQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue) => void;
  showError?: boolean;
}) {
  const label = q.required ? q.label : `${q.label} (optional)`;
  const error = showError ? 'Answer this to continue.' : undefined;

  switch (q.type) {
    case 'short_text':
    case 'long_text':
      return (
        <TextField
          label={label}
          placeholder={q.help}
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          multiline={q.type === 'long_text'}
          error={error}
        />
      );
    case 'number':
      return (
        <TextField
          label={q.unit ? `${label} · ${q.unit}` : label}
          placeholder={q.help}
          keyboardType="decimal-pad"
          inputMode="decimal"
          value={typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value : ''}
          onChangeText={(t) => {
            const n = Number(t.replace(',', '.'));
            onChange(t.trim() === '' ? null : Number.isFinite(n) ? n : t);
          }}
          error={error}
        />
      );
    case 'yes_no':
      return (
        <Field label={label} help={q.help} error={error} plainLabel>
          <SegmentedControl
            label={q.label}
            value={typeof value === 'string' ? value : null}
            onChange={onChange}
            options={[
              { value: 'no', label: 'No' },
              { value: 'yes', label: 'Yes' },
            ]}
          />
        </Field>
      );
    case 'single_choice': {
      const opts = q.options ?? [];
      // Short sets of short options read best as a segmented row; anything longer stacks.
      const compact = opts.length <= 4 && opts.every((o) => o.length <= 10);
      return (
        <Field label={label} help={q.help} error={error}>
          {compact ? (
            <SegmentedControl label={q.label} value={typeof value === 'string' ? value : null} onChange={onChange} options={opts.map((o) => ({ value: o, label: o }))} />
          ) : (
            <ChoiceList options={opts} selected={typeof value === 'string' ? [value] : []} multiple={false} onToggle={(o) => onChange(o)} groupLabel={q.label} />
          )}
        </Field>
      );
    }
    case 'multi_choice': {
      const selected = Array.isArray(value) ? value : [];
      return (
        <Field label={label} help={q.help ?? 'Pick any that apply.'} error={error}>
          <ChoiceList
            options={q.options ?? []}
            selected={selected}
            multiple
            groupLabel={q.label}
            onToggle={(o) => onChange(selected.includes(o) ? selected.filter((s) => s !== o) : [...selected, o])}
          />
        </Field>
      );
    }
  }
}

function Field({ label, help, error, plainLabel, children }: { label: string; help?: string; error?: string; plainLabel?: boolean; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      {plainLabel ? <Text>{label}</Text> : <Text variant="label" color="ink2">{label}</Text>}
      {help && !plainLabel ? (
        <Text variant="caption" color="ink2" style={{ marginTop: -space[1] }}>
          {help}
        </Text>
      ) : null}
      {children}
      {error ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
          <Feather name="alert-circle" size={14} color={colors.error} />
          <Text variant="caption" color="error">
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ChoiceList({
  options,
  selected,
  multiple,
  onToggle,
  groupLabel,
}: {
  options: string[];
  selected: string[];
  multiple: boolean;
  onToggle: (o: string) => void;
  groupLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole={multiple ? undefined : 'radiogroup'} accessibilityLabel={groupLabel} style={[styles.list, { borderColor: colors.line }]}>
      {options.map((o, i) => {
        const on = selected.includes(o);
        return (
          <Pressable
            key={o}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityState={multiple ? { checked: on } : { selected: on }}
            accessibilityLabel={o}
            onPress={() => {
              haptic.selection();
              onToggle(o);
            }}
            style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, on && { backgroundColor: colors.surface }]}
          >
            <View
              style={[
                multiple ? styles.box : styles.dot,
                { borderColor: on ? colors.ink : colors.ink2, backgroundColor: on ? colors.ink : 'transparent' },
              ]}
            >
              {on ? <Feather name={multiple ? 'check' : 'circle'} size={multiple ? 14 : 6} color={colors.paper} /> : null}
            </View>
            <Text style={{ flex: 1 }}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.control, overflow: 'hidden' },
  row: { minHeight: touchMin, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[3], paddingVertical: space[2] },
  box: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});
