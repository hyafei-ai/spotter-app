import '../src/polyfills';
import { Stack } from 'expo-router';
import { AppProviders } from '@spotter/ui';
import { spotterTheme } from '../src/env';

export default function RootLayout() {
  return (
    <AppProviders tenant={spotterTheme}>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </AppProviders>
  );
}
