import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { margin, radius, space } from '../tokens';
import { Text } from './Text';

/** Bottom sheet for quick choices (swap exercise, snooze until). Uses the system modal for back/escape behaviour. */
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      <View style={[styles.sheet, { backgroundColor: colors.paper, paddingBottom: insets.bottom + space[4] }]} accessibilityViewIsModal>
        <View style={[styles.grabber, { backgroundColor: colors.line }]} />
        <Text variant="headline" accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingTop: space[2] },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: space[3] },
  title: { paddingHorizontal: margin, paddingBottom: space[2] },
});
