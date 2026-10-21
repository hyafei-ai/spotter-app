import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { Button, EmptyState, Screen, Skeleton, margin, space } from '@spotter/ui';
import { completeFromUrl } from '@spotter/ui/platform';

/** Magic-link landing for coaches; see the client app's version for details. */
export default function AuthCallback() {
  const url = Linking.useLinkingURL();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') {
      router.replace('/sign-in');
      return;
    }
    if (!url) return;
    completeFromUrl(url)
      .then(() => router.replace('/sign-in'))
      .catch((e: Error) => setError(e.message));
  }, [url]);
  if (error) {
    return (
      <Screen footer={<Button label="Send a new link" onPress={() => router.replace('/sign-in')} />}>
        <EmptyState message={error} />
      </Screen>
    );
  }
  return (
    <Screen>
      <View style={{ padding: margin, paddingTop: space[12], gap: space[3] }} accessibilityLabel="Signing you in" accessibilityRole="progressbar">
        <Skeleton width="60%" height={28} />
        <Skeleton width="40%" />
      </View>
    </Screen>
  );
}
