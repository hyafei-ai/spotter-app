import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { radius, space, touchMin } from '../tokens';
import { Text } from './Text';

export type ButtonKind = 'primary' | 'secondary' | 'quiet' | 'destructive';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  kind?: ButtonKind;
  icon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  /** Shown under a disabled button so the user knows what's missing. */
  disabledReason?: string;
  full?: boolean;
}

export function Button({ label, kind = 'primary', icon, loading, disabled, disabledReason, full = true, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  const fill =
    kind === 'primary' ? colors.brand : kind === 'destructive' ? colors.error : kind === 'secondary' ? colors.surface : 'transparent';
  const fg = kind === 'primary' ? colors.brandInk : kind === 'destructive' ? '#FFFFFF' : kind === 'secondary' ? colors.ink : colors.brand;
  return (
    <View style={full ? styles.full : null}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
        accessibilityHint={isDisabled ? disabledReason : undefined}
        disabled={isDisabled}
        {...rest}
        style={({ pressed }) => [
          styles.base,
          { backgroundColor: fill, opacity: isDisabled ? 0.45 : pressed ? 0.85 : 1 },
          kind === 'secondary' && { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.line },
          kind === 'quiet' && { paddingHorizontal: space[2] },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <View style={styles.row}>
            {icon ? <Feather name={icon} size={18} color={fg} /> : null}
            <Text variant="bodyStrong" style={{ color: fg }} numberOfLines={2} align="center">
              {label}
            </Text>
          </View>
        )}
      </Pressable>
      {disabled && disabledReason ? (
        <Text variant="caption" color="ink2" align="center" style={styles.reason}>
          {disabledReason}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  full: { alignSelf: 'stretch' },
  base: {
    minHeight: touchMin + 4,
    borderRadius: radius.control,
    paddingHorizontal: space[5],
    paddingVertical: space[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  reason: { marginTop: space[2] },
});
