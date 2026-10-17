import Constants from 'expo-constants';
import { TenantConfig, resolveTenant } from '@spotter/core';

const fromConfig = TenantConfig.safeParse(Constants.expoConfig?.extra?.tenant);
export const tenant: TenantConfig = fromConfig.success ? fromConfig.data : resolveTenant(null);
export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
export const COACH_URL = (Constants.expoConfig?.extra?.coachUrl as string | undefined) ?? '/coach';
/** Demo builds show the "Switch to coach view" row and demo controls (C-10). */
export const IS_DEMO = !process.env.EXPO_PUBLIC_SUPABASE_URL;
