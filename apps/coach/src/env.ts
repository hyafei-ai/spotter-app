import Constants from 'expo-constants';
import { resolveTenant, type TenantConfig } from '@spotter/core';

/** MOCK: the signed-in coach's tenant. Real builds read it from memberships after sign-in. */
export const tenant: TenantConfig = resolveTenant('maya-reyes-strength');

/** The coach app is Spotter-branded, so it themes with the platform default accent, not the tenant's. */
export const spotterTheme: TenantConfig = { ...tenant, appName: 'Spotter Coach', brandColor: '#C2410C' };

export const CLIENT_URL = (Constants.expoConfig?.extra?.clientUrl as string | undefined) ?? '/';
