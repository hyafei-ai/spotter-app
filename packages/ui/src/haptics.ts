import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** The only three haptics in the product: set logged, sync failed, stepper change. */
const run = (fn: () => Promise<void>) => {
  if (Platform.OS === 'web') return;
  fn().catch(() => {});
};

export const haptic = {
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  selection: () => run(() => Haptics.selectionAsync()),
};
