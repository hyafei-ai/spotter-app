import { useRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Text, useTheme, space } from '@spotter/ui';

export interface SwipeAction {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  tone: 'brand' | 'ink' | 'success';
  onPress: () => void;
}

/**
 * Swipe actions on a triage row (K-1). Swipe right to reply, left to mark handled or snooze.
 * Every action is also in the row's "…" sheet, so nothing depends on the gesture.
 */
export function SwipeRow({ left, right, children }: { left?: SwipeAction[]; right?: SwipeAction[]; children: ReactNode }) {
  const ref = useRef<SwipeableMethods>(null);
  const { colors } = useTheme();
  const render = (actions: SwipeAction[]) => (
    <View style={styles.actions}>
      {actions.map((a) => {
        const bg = a.tone === 'brand' ? colors.brand : a.tone === 'success' ? colors.success : colors.ink;
        const fg = a.tone === 'brand' ? colors.brandInk : colors.paper;
        return (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            onPress={() => {
              ref.current?.close();
              a.onPress();
            }}
            style={[styles.action, { backgroundColor: bg }]}
          >
            <Feather name={a.icon} size={20} color={fg} />
            <Text variant="caption" style={{ color: fg }}>
              {a.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={left?.length ? () => render(left) : undefined}
      renderRightActions={right?.length ? () => render(right) : undefined}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row' },
  action: { width: 84, alignItems: 'center', justifyContent: 'center', gap: space[1] },
});
