import type { ExpoConfig } from 'expo/config';

/** The coach app is one shared Spotter-branded app on the stores; it shows whichever tenant the coach belongs to. */
const baseUrl = process.env.EXPO_BASE_URL;

const config: ExpoConfig = {
  name: 'Spotter Coach',
  slug: 'spotter-coach',
  scheme: 'spottercoach',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/icon.png',
  ios: { bundleIdentifier: 'app.spotter.coach', supportsTablet: true, usesAppleSignIn: true },
  android: { package: 'app.spotter.coach' },
  web: { output: 'single', bundler: 'metro', favicon: './assets/icon.png' },
  plugins: ['expo-router', 'expo-font', ['expo-splash-screen', { backgroundColor: '#F3EFE7', dark: { backgroundColor: '#171614' } }]],
  experiments: { typedRoutes: false, ...(baseUrl ? { baseUrl } : {}) },
  extra: { clientUrl: process.env.EXPO_PUBLIC_CLIENT_URL ?? '/' },
};

export default config;
