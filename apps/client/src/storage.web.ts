import type { QueuedMutation, QueueStore } from '@spotter/core';

/** Web preview build: localStorage stands in for SQLite. Same interface as storage.ts. */
const ls = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage);
const Q = 'spotter.queue.';

export const kv = {
  getItem: async (key: string) => ls()?.getItem(key) ?? null,
  setItem: async (key: string, value: string) => ls()?.setItem(key, value),
  removeItem: async (key: string) => ls()?.removeItem(key),
};

export const queueStore: QueueStore = {
  async all() {
    const s = ls();
    if (!s) return [];
    const out: QueuedMutation[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(Q)) out.push(JSON.parse(s.getItem(k)!) as QueuedMutation);
    }
    return out.sort((a, b) => (a.mutation.clientMutationId < b.mutation.clientMutationId ? -1 : 1));
  },
  async put(item) {
    ls()?.setItem(Q + item.mutation.clientMutationId, JSON.stringify(item));
  },
  async remove(ids) {
    for (const id of ids) ls()?.removeItem(Q + id);
  },
};

export async function clearLocalData(): Promise<void> {
  const s = ls();
  if (!s) return;
  const keys: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (k?.startsWith('spotter.')) keys.push(k);
  }
  keys.forEach((k) => s.removeItem(k));
}
