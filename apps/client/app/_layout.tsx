import '../src/polyfills';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AppProviders } from '@spotter/ui';
import { tenant } from '../src/env';
import { startSync, setDemoOffline } from '../src/sync';
import { useApp } from '../src/store';

export default function RootLayout() {
  const hydrated = useApp((s) => s.hydrated);
  useEffect(() => {
    void startSync();
  }, []);
  useEffect(() => {
    if (hydrated) setDemoOffline(useApp.getState().demo.offline);
  }, [hydrated]);
  return (
    <AppProviders tenant={tenant}>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="session/[id]/index" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="session/[id]/finish" options={{ gestureEnabled: false }} />
      </Stack>
    </AppProviders>
  );
}
