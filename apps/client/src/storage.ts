import * as SQLite from 'expo-sqlite';
import type { QueuedMutation, QueueStore } from '@spotter/core';

/**
 * Native local store (expo-sqlite). Two tables:
 *  - kv: app state snapshots (active session, history, onboarding)
 *  - mutation_queue: the outbound sync queue, one row per mutation
 * Web uses storage.web.ts instead.
 */
const db = SQLite.openDatabaseSync('spotter.db');
db.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS mutation_queue (id TEXT PRIMARY KEY NOT NULL, item TEXT NOT NULL);
`);

export const kv = {
  getItem: async (key: string): Promise<string | null> =>
    (await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key))?.value ?? null,
  setItem: async (key: string, value: string): Promise<void> => {
    await db.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    await db.runAsync('DELETE FROM kv WHERE key = ?', key);
  },
};

export const queueStore: QueueStore = {
  async all() {
    const rows = await db.getAllAsync<{ item: string }>('SELECT item FROM mutation_queue ORDER BY id');
    return rows.map((r) => JSON.parse(r.item) as QueuedMutation);
  },
  async put(item) {
    await db.runAsync('INSERT OR REPLACE INTO mutation_queue (id, item) VALUES (?, ?)', item.mutation.clientMutationId, JSON.stringify(item));
  },
  async remove(ids) {
    if (ids.length === 0) return;
    await db.runAsync(`DELETE FROM mutation_queue WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
  },
};

export async function clearLocalData(): Promise<void> {
  await db.execAsync('DELETE FROM kv; DELETE FROM mutation_queue;');
}
