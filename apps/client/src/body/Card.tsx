import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Text, useTheme, margin, radius, space } from '@spotter/ui';

/**
 * One Body card: the area's name, one plain line (the answer), a small chart and a caption. The whole card
 * opens the area's detail. Cards are for grouped, tappable things (art direction §6), which these are.
 */
export function BodyCard({ title, line, children, caption, onPress, hint }: { title: string; line: string; children?: ReactNode; caption?: string; onPress: () => void; hint: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${line}`}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.card, { backgroundColor: pressed ? colors.line : colors.surface, borderColor: colors.line }]}
    >
      <View style={styles.top}>
        <Text variant="label" color="ink2" style={{ flex: 1 }}>
          {title}
        </Text>
        <Feather name="chevron-right" size={18} color={colors.ink2} />
      </View>
      <Text variant="headline">{line}</Text>
      {children}
      {caption ? (
        <Text variant="caption" color="ink2">
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: margin, marginTop: space[3], padding: space[4], borderRadius: radius.sheet, borderWidth: StyleSheet.hairlineWidth * 2, gap: space[2] },
  top: { flexDirection: 'row', alignItems: 'center' },
});
