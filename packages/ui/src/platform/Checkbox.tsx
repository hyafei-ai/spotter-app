import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { haptic } from '../haptics';
import { space, touchMin } from '../tokens';
import { Text } from '../components/Text';

/** A labelled checkbox; the whole row is the target. Used for consent at sign-up. */
export function Checkbox({ checked, onChange, label, children }: { checked: boolean; onChange: (v: boolean) => void; label: string; children?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel={label}
      onPress={() => {
        haptic.selection();
        onChange(!checked);
      }}
      style={styles.row}
    >
      <View style={[styles.box, { borderColor: checked ? colors.ink : colors.ink2, backgroundColor: checked ? colors.ink : 'transparent' }]}>
        {checked ? <Feather name="check" size={16} color={colors.paper} /> : null}
      </View>
      <View style={{ flex: 1 }}>{children ?? <Text>{label}</Text>}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], minHeight: touchMin, paddingVertical: space[1] },
  box: { width: 24, height: 24, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
