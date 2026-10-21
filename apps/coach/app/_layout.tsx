import '../src/polyfills';
import { Stack } from 'expo-router';
import { AppProviders } from '@spotter/ui';
import { configureForegroundNotifications, initObservability } from '@spotter/ui/platform';
import { spotterTheme, tenant } from '../src/env';
import { Lifecycle } from '../src/platform/Lifecycle';

initObservability({ app: 'coach', tenantSlug: tenant.slug, release: '0.1.0' });
configureForegroundNotifications();

export default function RootLayout() {
  return (
    <AppProviders tenant={spotterTheme}>
      <Lifecycle />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </AppProviders>
  );
}
