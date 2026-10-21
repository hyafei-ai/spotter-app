import { Platform } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { secureStorage } from './secureStorage';

/**
 * The Supabase client shared by both apps. Null in demo builds (no EXPO_PUBLIC_SUPABASE_URL),
 * where everything runs on local sample data instead. Callers must handle null.
 */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isConfigured = (): boolean => SUPABASE_URL.length > 0 && ANON_KEY.length > 0;

export const supabase: SupabaseClient | null = isConfigured()
  ? createClient(SUPABASE_URL, ANON_KEY, {
      auth: {
        storage: secureStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: Platform.OS === 'web',
        flowType: 'pkce',
      },
    })
  : null;

export function functionUrl(name: string): string {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

/** Calls an Edge Function as the signed-in user. Throws with the function's own error message. */
export async function callFunction<T>(name: string, init: { method?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
  if (!supabase) throw new Error('Not connected to a server (demo build).');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to continue.');
  const qs = init.query ? `?${Object.entries(init.query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '';
  const res = await fetch(functionUrl(name) + qs, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', apikey: ANON_KEY },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Server returned ${res.status}`);
  return json as T;
}
