import { useSyncExternalStore } from 'react';
import { secureStorage } from './secureStorage';
import { supabase } from './supabase';

/**
 * Auth state shared by both apps.
 *  demo      no server configured; the app runs on sample data with no sign-in
 *  loading   reading the stored session
 *  signedOut never signed in on this device (or signed out on purpose)
 *  signedIn  a valid session
 *  expired   was signed in, the session could not be refreshed; re-auth returns to `returnTo`
 */
export type AuthStatus = 'demo' | 'loading' | 'signedOut' | 'signedIn' | 'expired';
export interface AuthState {
  status: AuthStatus;
  userId: string | null;
  email: string | null;
}

let state: AuthState = { status: supabase ? 'loading' : 'demo', userId: null, email: null };
const listeners = new Set<() => void>();
const set = (next: Partial<AuthState>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
export const getAuth = () => state;

let started = false;
let signingOut = false;

/** Restores the stored session and follows auth changes. Safe to call more than once. */
export function startAuth(): void {
  if (started || !supabase) return;
  started = true;
  void supabase.auth.getSession().then(({ data }) => {
    const s = data.session;
    set(s ? { status: 'signedIn', userId: s.user.id, email: s.user.email ?? null } : { status: 'signedOut' });
  });
  supabase.auth.onAuthStateChange((event, session) => {
    if (session) {
      set({ status: 'signedIn', userId: session.user.id, email: session.user.email ?? null });
      return;
    }
    if (event === 'SIGNED_OUT') {
      // A sign-out we didn't ask for means the refresh token stopped working: treat it as expiry.
      set({ status: signingOut || state.status !== 'signedIn' ? 'signedOut' : 'expired', userId: signingOut ? null : state.userId });
      signingOut = false;
    }
  });
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  signingOut = true;
  await supabase.auth.signOut();
}

export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/* ---------- where to go back to after re-authenticating ---------- */

const RETURN_KEY = 'spotter.returnTo';

export async function rememberReturnTo(path: string): Promise<void> {
  if (!path.startsWith('/') || path.startsWith('/sign-in') || path.startsWith('/auth')) return;
  await secureStorage.setItem(RETURN_KEY, path);
}

export async function takeReturnTo(): Promise<string | null> {
  const p = await secureStorage.getItem(RETURN_KEY);
  await secureStorage.removeItem(RETURN_KEY);
  return p && p.startsWith('/') ? p : null;
}
