import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';

/**
 * Registers this device for push (devices table) once notifications are allowed.
 * No-op on web, in simulators and in demo builds. The notify Edge Function does the sending.
 */
export async function registerForPush(tenantId: string, appVersion: string): Promise<'registered' | 'denied' | 'unavailable'> {
  if (!supabase || Platform.OS === 'web' || !Device.isDevice) return 'unavailable';
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return 'denied';
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return 'unavailable';
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user.id;
  if (!uid) return 'unavailable';
  const { error } = await supabase
    .from('devices')
    .upsert(
      { tenant_id: tenantId, profile_id: uid, expo_push_token: token, platform: Platform.OS, app_version: appVersion, last_seen_at: new Date().toISOString(), disabled_at: null },
      { onConflict: 'profile_id,expo_push_token' },
    );
  return error ? 'unavailable' : 'registered';
}

/** Shows pushes as banners while the app is open (Expo's default is to drop them). */
export function configureForegroundNotifications(): void {
  if (Platform.OS === 'web') return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}
