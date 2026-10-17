import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { margin, space } from '../tokens';

/** Paper background, safe areas, optional pinned footer for the one primary action (thumb zone). */
export function Screen({
  children,
  footer,
  scroll = true,
  banner,
  edgesTop = true,
}: {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  banner?: ReactNode;
  edgesTop?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView contentContainerStyle={{ paddingBottom: space[8] }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1 }}>{children}</View>
  );
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.paper, paddingTop: edgesTop ? insets.top : 0 }}
    >
      {banner}
      <View style={{ flex: 1 }}>{body}</View>
      {footer ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, space[3]), borderTopColor: colors.line, backgroundColor: colors.paper },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  footer: { paddingHorizontal: margin, paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth, gap: space[2] },
});
