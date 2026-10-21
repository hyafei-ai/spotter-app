import '../src/polyfills';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AppProviders } from '@spotter/ui';
import { configureForegroundNotifications, initObservability } from '@spotter/ui/platform';
import { APP_VERSION, BUILD_TENANT } from '../src/env';
import { startSync, setDemoOffline } from '../src/sync';
import { useApp } from '../src/store';
import { initRuntimeTenant, useRuntimeTenant } from '../src/runtimeTenant';
import { Lifecycle } from '../src/platform/Lifecycle';

initObservability({ app: 'client', tenantSlug: BUILD_TENANT.slug, release: APP_VERSION });
configureForegroundNotifications();

export default function RootLayout() {
  const hydrated = useApp((s) => s.hydrated);
  const { tenant, ready, rev } = useRuntimeTenant();
  useEffect(() => {
    void startSync();
    void initRuntimeTenant();
  }, []);
  useEffect(() => {
    if (hydrated) setDemoOffline(useApp.getState().demo.offline);
  }, [hydrated]);
  return (
    // Keyed by tenant so a trainer code (shared app) or a brand change re-themes every screen.
    <AppProviders key={rev} tenant={tenant} ready={ready}>
      <Lifecycle />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="session/[id]/index" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }} />
        <Stack.Screen name="session/[id]/finish" options={{ gestureEnabled: false }} />
      </Stack>
    </AppProviders>
  );
}
