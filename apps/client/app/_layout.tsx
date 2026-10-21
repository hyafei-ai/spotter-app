import '../src/polyfills';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AppProviders } from '@spotter/ui';
import { configureForegroundNotifications, initObservability } from '@spotter/ui/platform';
import { APP_VERSION, tenant } from '../src/env';
import { startSync, setDemoOffline } from '../src/sync';
import { useApp } from '../src/store';
import { Lifecycle } from '../src/platform/Lifecycle';

initObservability({ app: 'client', tenantSlug: tenant.slug, release: APP_VERSION });
configureForegroundNotifications();

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
      <Lifecycle />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="session/[id]/index" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="session/[id]/finish" options={{ gestureEnabled: false }} />
      </Stack>
    </AppProviders>
  );
}
