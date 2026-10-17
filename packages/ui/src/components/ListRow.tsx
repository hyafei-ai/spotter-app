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
  const body = (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }]}>
      {left}
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
      {right}
      {chevron ? <Feather name="chevron-right" size={20} color={colors.ink2} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, reason, subtitle].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => ({ backgroundColor: pressed ? colors.surface : 'transparent' })}
    >
      {body}
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
});
