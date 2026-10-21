/**
 * MOCK: demo-only storage shared by the client and coach apps.
 *
 * Real builds read and write Supabase (form_checks, check_ins, …). With no server, the two apps on the
 * web preview share an origin, so localStorage carries a client's form check to the coach and the
 * coach's reply back. On native each app keeps its own copy (the client app passes its SQLite kv in).
 */
export interface DemoBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const memory = new Map<string, string>();
const local = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

let backend: DemoBackend = {
  getItem: async (k) => local()?.getItem(k) ?? memory.get(k) ?? null,
  setItem: async (k, v) => {
    const ls = local();
    if (ls) ls.setItem(k, v);
    else memory.set(k, v);
  },
};

export function setDemoBackend(b: DemoBackend) {
  backend = b;
}

const listeners = new Set<(key: string) => void>();

export async function readShared<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await backend.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeShared(key: string, value: unknown): Promise<void> {
  await backend.setItem(key, JSON.stringify(value));
  listeners.forEach((l) => l(key));
}

/** Fires when this app or (on web) another tab/app on the same origin changes a shared key. */
export function onSharedChange(fn: (key: string) => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => e.key && fn(e.key);
  const w = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
  w?.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    w?.removeEventListener('storage', onStorage);
  };
}
