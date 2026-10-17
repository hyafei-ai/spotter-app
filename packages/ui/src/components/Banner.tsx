import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { margin, space, touchMin } from '../tokens';
import { Text } from './Text';

export type BannerTone = 'quiet' | 'warning' | 'error';

/** Offline, sync and error banners. Always words plus an icon; never colour alone. */
export function Banner({
  tone = 'quiet',
  message,
  actionLabel,
  onAction,
}: {
  tone?: BannerTone;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  const fg = tone === 'error' ? colors.error : tone === 'warning' ? colors.warning : colors.ink2;
  const icon = tone === 'quiet' ? 'smartphone' : 'alert-circle';
  return (
    <View
      accessibilityRole={tone === 'quiet' ? 'text' : 'alert'}
      accessibilityLiveRegion="polite"
      style={[styles.wrap, { backgroundColor: colors.surface, borderBottomColor: colors.line }]}
    >
      <Feather name={icon} size={16} color={fg} />
      <Text variant="callout" style={[styles.msg, { color: tone === 'quiet' ? colors.ink2 : colors.ink }]}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8} style={styles.action}>
          <Text variant="bodyStrong" style={{ color: colors.brand }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: margin,
    paddingVertical: space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  msg: { flex: 1 },
  action: { minHeight: touchMin - 8, justifyContent: 'center', paddingHorizontal: space[1] },
});
