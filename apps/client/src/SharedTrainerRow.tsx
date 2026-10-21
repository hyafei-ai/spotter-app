import { Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { ListRow } from '@spotter/ui';
import { IS_SHARED } from './env';
import { leaveTrainer, useRuntimeTenant } from './runtimeTenant';

/** Me row in the shared Spotter app: which trainer's code is in use, with a way to change it. */
export function SharedTrainerRow() {
  const tenant = useRuntimeTenant((s) => s.tenant);
  if (!IS_SHARED) return null;
  const change = () => {
    const go = () => void leaveTrainer().then(() => router.replace('/welcome'));
    const msg = 'You’ll need a code from your new trainer. Your history with this trainer stays on their account.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(msg)) go();
      return;
    }
    Alert.alert('Change trainer?', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change trainer', style: 'destructive', onPress: go },
    ]);
  };
  return <ListRow title="Trainer" subtitle={`${tenant.appName} · code ${tenant.joinCode ?? ''}`.trim()} chevron onPress={change} accessibilityHint="Opens a prompt to switch to a different trainer’s code" />;
}
