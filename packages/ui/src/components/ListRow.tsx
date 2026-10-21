import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { margin, rowMin, space } from '../tokens';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Plain-language reason line shown in the brand colour (triage, due items). */
  reason?: string;
  left?: ReactNode;
  right?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  last?: boolean;
}

export function ListRow({ title, subtitle, reason, left, right, chevron, onPress, accessibilityLabel, accessibilityHint, last }: ListRowProps) {
  const { colors } = useTheme();
  const divider = !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line };
  const text = (
    <View style={styles.text}>
      <Text variant="bodyStrong" numberOfLines={2}>
        {title}
      </Text>
      {reason ? (
        <Text variant="callout" style={{ color: colors.brand }}>
          {reason}
        </Text>
      ) : null}
      {subtitle ? (
        <Text variant="callout" color="ink2">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
  const chevronIcon = chevron ? <Feather name="chevron-right" size={20} color={colors.ink2} /> : null;
  const a11y = {
    accessibilityRole: 'button' as const,
    accessibilityLabel: accessibilityLabel ?? [title, reason, subtitle].filter(Boolean).join(', '),
    accessibilityHint,
  };

  if (!onPress) {
    return (
      <View style={[styles.row, divider]}>
        {left}
        {text}
        {right}
        {chevronIcon}
      </View>
    );
  }
  if (right) {
    // `right` may hold its own button: keep it outside the row's button so controls aren't nested.
    return (
      <View style={[styles.split, divider]}>
        <Pressable onPress={onPress} {...a11y} style={({ pressed }) => [styles.splitMain, { backgroundColor: pressed ? colors.surface : 'transparent' }]}>
          {left}
          {text}
        </Pressable>
        {right}
        {chevronIcon}
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} {...a11y} style={({ pressed }) => ({ backgroundColor: pressed ? colors.surface : 'transparent' })}>
      <View style={[styles.row, divider]}>
        {left}
        {text}
        {chevronIcon}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: rowMin,
    paddingVertical: space[3],
    marginHorizontal: margin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  text: { flex: 1, gap: 2 },
  split: { marginHorizontal: margin, flexDirection: 'row', alignItems: 'center', gap: space[3] },
  splitMain: { flex: 1, minHeight: rowMin, paddingVertical: space[3], flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
