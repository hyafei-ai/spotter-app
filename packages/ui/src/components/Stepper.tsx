import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { haptic } from '../haptics';
import { radius, space, touchMin } from '../tokens';
import { Text } from './Text';

export interface StepperProps {
  label: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  format?: (v: number) => string;
  /** Spoken unit, e.g. "kilograms". */
  unitLabel?: string;
  onChange: (v: number) => void;
}

/** Large gym-friendly stepper. Exposed to VoiceOver/TalkBack as an adjustable control. */
export function Stepper({ label, value, step, min = 0, max = 9999, format = String, unitLabel, onChange }: StepperProps) {
  const { colors } = useTheme();
  const set = (v: number) => {
    const next = Math.min(max, Math.max(min, Math.round(v * 1000) / 1000));
    if (next !== value) {
      haptic.selection();
      onChange(next);
    }
  };
  const spoken = `${format(value)}${unitLabel ? ` ${unitLabel}` : ''}`;
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: spoken }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => set(e.nativeEvent.actionName === 'increment' ? value + step : value - step)}
      style={[styles.wrap, { borderColor: colors.line, backgroundColor: colors.surface }]}
    >
      <Text variant="label" color="ink2" style={styles.label}>
        {label}
      </Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => set(value - step)}
          importantForAccessibility="no"
          accessibilityElementsHidden
          hitSlop={6}
          style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="minus" size={22} color={colors.ink} />
        </Pressable>
        <Text variant="figure" tabular style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
          {format(value)}
        </Text>
        <Pressable
          onPress={() => set(value + step)}
          importantForAccessibility="no"
          accessibilityElementsHidden
          hitSlop={6}
          style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="plus" size={22} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.control, paddingTop: space[2], minWidth: 140 },
  label: { textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  btn: { width: touchMin, height: touchMin, alignItems: 'center', justifyContent: 'center' },
  value: { flex: 1, textAlign: 'center' },
});
