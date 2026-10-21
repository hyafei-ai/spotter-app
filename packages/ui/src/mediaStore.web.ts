import { SAMPLE_CLIP } from './sampleClip';

/**
 * Web preview: picked videos and voice-overs are kept as Blobs in IndexedDB so they survive reloads
 * and the coach app (same origin, different path) can play what the client app sent.
 * MOCK: real builds upload to Supabase Storage / Mux and play from a signed URL.
 */
export type MediaRef = string;

const DB = 'spotter-media';
const STORE = 'blobs';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function keepMedia(id: string, uri: string, _ext: string): Promise<MediaRef> {
  const blob = await (await fetch(uri)).blob();
  await tx('readwrite', (s) => s.put(blob, id));
  return `idb:${id}`;
}

const urls = new Map<string, string>();

export async function resolveMedia(ref: MediaRef): Promise<string | number | null> {
  if (ref === 'sample') return SAMPLE_CLIP;
  if (!ref.startsWith('idb:')) return ref;
  const cached = urls.get(ref);
  if (cached) return cached;
  try {
    const blob = await tx<Blob | undefined>('readonly', (s) => s.get(ref.slice(4)) as IDBRequest<Blob | undefined>);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(ref, url);
    return url;
  } catch {
    return null;
  }
}
