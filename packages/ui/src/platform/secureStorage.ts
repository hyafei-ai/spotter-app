import * as SecureStore from 'expo-secure-store';

/**
 * Session storage for Supabase auth on iOS/Android: the Keychain / Keystore via expo-secure-store.
 * SecureStore values are limited to ~2 KB, and a Supabase session can be larger, so values are
 * split into chunks. Web uses secureStorage.web.ts (localStorage).
 */
const CHUNK = 1800;
const safeKey = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safeKey(key);
    const count = await SecureStore.getItemAsync(`${k}.n`);
    if (count == null) return SecureStore.getItemAsync(k);
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${k}.${i}`);
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const k = safeKey(key);
    await secureStorage.removeItem(key);
    if (value.length <= CHUNK) return SecureStore.setItemAsync(k, value);
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(`${k}.n`, String(n));
  },
  async removeItem(key: string): Promise<void> {
    const k = safeKey(key);
    const count = await SecureStore.getItemAsync(`${k}.n`);
    if (count != null) {
      for (let i = 0; i < Number(count); i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
      await SecureStore.deleteItemAsync(`${k}.n`);
    }
    await SecureStore.deleteItemAsync(k);
  },
};
