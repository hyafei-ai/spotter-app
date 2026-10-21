import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';
import { SyncPushResponse, SyncQueue, type Mutation, type SyncStatus, type SyncTransport } from '@spotter/core';
import { queueStore } from './storage';
import { recordAppOpen } from './appOpen';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

/** Real transport: POST /sync/push on the Supabase Edge Function. */
class EdgeFunctionTransport implements SyncTransport {
  constructor(private url: string, private getToken: () => string | null) {}
  async push(mutations: Mutation[]) {
    const res = await fetch(`${this.url}/functions/v1/sync-push`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.getToken() ?? ''}` },
      body: JSON.stringify({ mutations }),
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    return SyncPushResponse.parse(await res.json());
  }
}

/**
 * MOCK — demo transport used when no Supabase project is configured. Accepts everything
 * after a short delay; "Simulate offline" in Me makes it fail like a dead connection.
 */
export const demoNetwork = { offline: false };
class DemoTransport implements SyncTransport {
  async push(mutations: Mutation[]) {
    await new Promise((r) => setTimeout(r, 350));
    if (demoNetwork.offline) throw new Error('No connection');
    return { accepted: mutations.map((m) => m.clientMutationId), rejected: [] };
  }
}

export const syncQueue = new SyncQueue(
  queueStore,
  SUPABASE_URL ? new EdgeFunctionTransport(SUPABASE_URL, () => null) : new DemoTransport(),
);

interface SyncState {
  status: SyncStatus;
  online: boolean;
}
export const useSync = create<SyncState>(() => ({ status: { kind: 'synced' }, online: true }));

let started = false;
/** Flush on reconnect, on app foreground, and every 30 s while online (NFR: Offline and sync). */
export async function startSync(): Promise<void> {
  if (started) return;
  started = true;
  await syncQueue.init();
  syncQueue.subscribe((status) => useSync.setState({ status }));
  NetInfo.addEventListener((s) => {
    const online = s.isConnected !== false && !demoNetwork.offline;
    const was = useSync.getState().online;
    useSync.setState({ online });
    if (online && !was) void syncQueue.wake();
  });
  AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      void recordAppOpen();
      void syncQueue.flush();
    }
  });
  setInterval(() => {
    if (useSync.getState().online) void syncQueue.flush();
  }, 30_000);
  await recordAppOpen();
  void syncQueue.flush();
}

export function setDemoOffline(offline: boolean) {
  demoNetwork.offline = offline;
  useSync.setState({ online: !offline });
  if (!offline) void syncQueue.wake();
}
