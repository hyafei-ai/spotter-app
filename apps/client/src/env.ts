import Constants from 'expo-constants';
import { TenantConfig, resolveTenant } from '@spotter/core';

const fromConfig = TenantConfig.safeParse(Constants.expoConfig?.extra?.tenant);
/** The tenant the app was built for. In the shared Spotter app this is the neutral "Spotter" config. */
export const BUILD_TENANT: TenantConfig = fromConfig.success ? fromConfig.data : resolveTenant(null);
/**
 * The tenant the app is showing. A live binding: src/runtimeTenant.ts replaces it when a client enters
 * a trainer code in the shared app, or when a saved brand edit applies, and the root layout remounts.
 */
export let tenant: TenantConfig = BUILD_TENANT;
export function setTenant(next: TenantConfig) {
  tenant = next;
}
/** Built as the shared "Spotter" app (TENANT_ID=spotter): branding comes from a trainer code at runtime (W-3). */
export const IS_SHARED = Constants.expoConfig?.extra?.shared === true;
export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';
export const COACH_URL = (Constants.expoConfig?.extra?.coachUrl as string | undefined) ?? '/coach-app';
/** Demo builds show the "Switch to coach view" row and demo controls (C-10). */
export const IS_DEMO = !process.env.EXPO_PUBLIC_SUPABASE_URL;
