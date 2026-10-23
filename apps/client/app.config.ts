import { readFileSync } from 'node:fs';
import type { ExpoConfig } from 'expo/config';
import demoTenants from '@spotter/core/demo-tenants.json';
import sharedTenant from '@spotter/core/shared-tenant.json';

type Tenant = (typeof demoTenants)['maya-reyes-strength'] & {
  splashBackground?: string;
  easProjectId?: string;
};
const all = demoTenants as Record<string, Tenant>;

/**
 * One codebase, one client app per trainer (W-2).
 * - TENANT_CONFIG_PATH: a JSON tenant written by scripts/tenant-build.mjs from the `tenants` table (real builds).
 * - TENANT_ID=spotter: the shared Spotter app, which loads a trainer's branding at runtime from their code.
 * - TENANT_ID=<demo slug>, or unset: a demo tenant (the web preview uses Maya Reyes Strength).
 */
const tenantId = process.env.TENANT_ID;
const shared = tenantId === 'spotter';
const tenant: Tenant = process.env.TENANT_CONFIG_PATH
  ? (JSON.parse(readFileSync(process.env.TENANT_CONFIG_PATH, 'utf8')) as Tenant)
  : shared
    ? (sharedTenant as Tenant)
    : (all[tenantId ?? ''] ?? all['maya-reyes-strength']!);

const baseUrl = process.env.EXPO_BASE_URL;
const easProjectId = tenant.easProjectId ?? process.env.EAS_PROJECT_ID;
const splashBg = tenant.splashBackground ?? '#F3EFE7';
const buildNumber = process.env.BUILD_NUMBER ?? '1';

const config: ExpoConfig = {
  name: tenant.appName,
  slug: tenant.slug,
  scheme: tenant.scheme,
  version: process.env.APP_VERSION ?? '0.1.0',
  // JS-only feature updates ship over EAS Update without a store review; native changes need a rebuild.
  runtimeVersion: { policy: 'appVersion' },
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: `./assets/tenants/${tenant.slug}/icon.png`,
  ios: {
    bundleIdentifier: tenant.bundleIds.ios,
    buildNumber,
    supportsTablet: false,
    usesAppleSignIn: true,
    infoPlist: {
      NSCameraUsageDescription: 'Record a set so your coach can check your form.',
      NSMicrophoneUsageDescription: 'Record audio with form-check videos.',
      NSPhotoLibraryUsageDescription: 'Pick a video of a set to send to your coach.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: tenant.bundleIds.android,
    versionCode: Number(buildNumber),
    adaptiveIcon: { foregroundImage: `./assets/tenants/${tenant.slug}/icon.png`, backgroundColor: tenant.brandColor },
  },
  web: { output: 'single', bundler: 'metro', favicon: `./assets/tenants/${tenant.slug}/icon.png` },
  plugins: [
    'expo-router',
    'expo-sqlite',
    [
      'expo-splash-screen',
      { image: `./assets/tenants/${tenant.slug}/splash.png`, imageWidth: 160, backgroundColor: splashBg, dark: { backgroundColor: '#171614' } },
    ],
    ['expo-notifications', { color: tenant.brandColor }],
    'expo-font',
    ['expo-camera', { cameraPermission: 'Scan food barcodes and record sets for your coach.', recordAudioAndroid: true }],
    ['@kingstinct/react-native-healthkit', { NSHealthShareUsageDescription: 'Read your steps, bodyweight and sleep so your coach can see them next to your training.', NSHealthUpdateUsageDescription: false, background: false }],
    'expo-health-connect',
    // The trainer's Apple Watch app (docs/features/watch.md). Opt-in: web exports, Android and today's EAS
    // builds are unchanged unless SPOTTER_WATCH=1 (scripts/tenant-build.mjs sets it for iOS builds).
    ...(process.env.SPOTTER_WATCH === '1' ? ['./plugins/withSpotterWatch.js'] : []),
  ],
  experiments: { typedRoutes: false, ...(baseUrl ? { baseUrl } : {}) },
  updates: {
    ...(easProjectId ? { url: `https://u.expo.dev/${easProjectId}` } : {}),
    requestHeaders: { 'expo-channel-name': tenant.updateChannel },
  },
  extra: {
    tenant,
    shared,
    coachUrl: process.env.EXPO_PUBLIC_COACH_URL ?? '/coach-app',
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
  },
};

export default config;
