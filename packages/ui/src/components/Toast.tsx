import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { margin, radius, space, touchMin } from '../tokens';
import { Text } from './Text';

interface ToastSpec {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

const ToastContext = createContext<(t: ToastSpec) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

/** One toast at a time, above the thumb zone. Used for Undo after logging a set or marking handled. */
export function ToastProvider({ children, bottomOffset = 148 }: { children: ReactNode; bottomOffset?: number }) {
  const [toast, setToast] = useState<(ToastSpec & { key: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const show = useCallback((t: ToastSpec) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ ...t, key: Date.now() });
    AccessibilityInfo.announceForAccessibility(t.message);
    timer.current = setTimeout(() => setToast(null), t.durationMs ?? 5000);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          key={toast.key}
          entering={reduceMotion ? undefined : FadeInDown.duration(180)}
          exiting={reduceMotion ? undefined : FadeOutDown.duration(180)}
          style={[styles.wrap, { bottom: insets.bottom + bottomOffset }]}
          pointerEvents="box-none"
        >
          <View style={[styles.toast, { backgroundColor: colors.ink }]}>
            <Text variant="callout" style={[styles.msg, { color: colors.paper }]}>
              {toast.message}
            </Text>
            {toast.actionLabel && toast.onAction ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  toast.onAction?.();
                  setToast(null);
                }}
                style={styles.action}
                hitSlop={8}
              >
                <Text variant="bodyStrong" style={{ color: colors.paper, textDecorationLine: 'underline' }}>
                  {toast.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: margin, right: margin },
  toast: { borderRadius: radius.control, paddingLeft: space[4], paddingRight: space[2], minHeight: touchMin, flexDirection: 'row', alignItems: 'center' },
  msg: { flex: 1, paddingVertical: space[3] },
  action: { minHeight: touchMin, minWidth: touchMin, justifyContent: 'center', alignItems: 'center', paddingHorizontal: space[3] },
});
