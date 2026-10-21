import type { ExpoConfig } from 'expo/config';
import demoTenants from '@spotter/core/demo-tenants.json';

type Tenant = (typeof demoTenants)['maya-reyes-strength'];
const all = demoTenants as Record<string, Tenant>;

/**
 * One codebase, one client app per trainer (W-2). TENANT_ID picks the tenant config;
 * in production this is fetched from the `tenants` table by the publish job before `eas build`.
 */
const tenant: Tenant = all[process.env.TENANT_ID ?? ''] ?? all['maya-reyes-strength']!;
const baseUrl = process.env.EXPO_BASE_URL;

const config: ExpoConfig = {
  name: tenant.appName,
  slug: tenant.slug,
  scheme: tenant.scheme,
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: `./assets/tenants/${tenant.slug}/icon.png`,
  ios: {
    bundleIdentifier: tenant.bundleIds.ios,
    supportsTablet: false,
    usesAppleSignIn: true,
    infoPlist: {
      NSCameraUsageDescription: 'Record a set so your coach can check your form.',
      NSMicrophoneUsageDescription: 'Record audio with form-check videos.',
      NSPhotoLibraryUsageDescription: 'Pick a video of a set to send to your coach.',
    },
  },
  android: {
    package: tenant.bundleIds.android,
    adaptiveIcon: { foregroundImage: `./assets/tenants/${tenant.slug}/icon.png`, backgroundColor: tenant.brandColor },
  },
  web: { output: 'single', bundler: 'metro', favicon: `./assets/tenants/${tenant.slug}/icon.png` },
  plugins: [
    'expo-router',
    'expo-sqlite',
    [
      'expo-splash-screen',
      { image: `./assets/tenants/${tenant.slug}/splash.png`, imageWidth: 160, backgroundColor: '#F3EFE7', dark: { backgroundColor: '#171614' } },
    ], ['expo-notifications', { color: tenant.brandColor }], 'expo-font',
    ['expo-camera', { cameraPermission: 'Scan food barcodes and record sets for your coach.', recordAudioAndroid: true }],
    ['@kingstinct/react-native-healthkit', { NSHealthShareUsageDescription: 'Read your steps, bodyweight and sleep so your coach can see them next to your training.', NSHealthUpdateUsageDescription: false, background: false }],
    'expo-health-connect',
  ],
  experiments: { typedRoutes: false, ...(baseUrl ? { baseUrl } : {}) },
  updates: { requestHeaders: { 'expo-channel-name': tenant.updateChannel } },
  extra: {
    tenant,
    coachUrl: process.env.EXPO_PUBLIC_COACH_URL ?? '/coach-app',
  },
};

export default config;
