import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

/** Sign-in methods (C-1): email magic link, Sign in with Apple (iOS), Google. */

export const GOOGLE_CLIENT_IDS = {
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
};

export const googleAvailable = (): boolean =>
  !!supabase && !!(Platform.OS === 'ios' ? GOOGLE_CLIENT_IDS.ios : Platform.OS === 'android' ? GOOGLE_CLIENT_IDS.android : GOOGLE_CLIENT_IDS.web);

/** App Store rule 4.8: Sign in with Apple must be offered on iOS whenever another social sign-in is. */
export async function appleAvailable(): Promise<boolean> {
  if (!supabase || Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync();
}

function need<T>(v: T | null): T {
  if (!v) throw new Error('Not connected to a server (demo build).');
  return v;
}

export async function sendMagicLink(email: string): Promise<void> {
  const db = need(supabase);
  const { error } = await db.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: Linking.createURL('/auth/callback'), shouldCreateUser: true },
  });
  if (error) throw new Error(error.status === 429 ? 'Too many links sent. Wait a minute and try again.' : error.message);
}

/** Native deep link from the magic-link email: exchanges the PKCE code for a session. */
export async function completeFromUrl(url: string): Promise<boolean> {
  const db = need(supabase);
  const { queryParams } = Linking.parse(url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  if (!code) return false;
  const { error } = await db.auth.exchangeCodeForSession(code);
  if (error) throw new Error('This sign-in link has expired. Send a new one.');
  return true;
}

export async function signInWithApple(): Promise<void> {
  const db = need(supabase);
  const raw = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  const cred = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    nonce: hashed,
  });
  if (!cred.identityToken) throw new Error('Apple didn’t return a sign-in token. Try again.');
  const { error } = await db.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce: raw });
  if (error) throw new Error(error.message);
}

export async function signInWithGoogleIdToken(idToken: string): Promise<void> {
  const { error } = await need(supabase).auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw new Error(error.message);
}

/** Web: redirect-based Google sign-in; the session is picked up from the URL on return. */
export async function signInWithGoogleRedirect(returnPath: string): Promise<void> {
  const { error } = await need(supabase).auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: typeof window === 'undefined' ? undefined : `${window.location.origin}${returnPath}` },
  });
  if (error) throw new Error(error.message);
}
