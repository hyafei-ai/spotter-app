import { create } from 'zustand';
import { demoReplies } from '@spotter/core/demo';
import { kv } from '../storage';

/** Which coach replies the client has opened, so Today only flags new ones. Device-local. */
const KEY = 'spotter.formchecks.seen';

export const useSeenReplies = create<{ seen: Set<string>; loaded: boolean }>(() => ({ seen: new Set(), loaded: false }));

export async function loadSeenReplies() {
  if (useSeenReplies.getState().loaded) return;
  const raw = await kv.getItem(KEY);
  // MOCK: the seeded reply from last week counts as already read.
  const initial = raw ? (JSON.parse(raw) as string[]) : Object.keys(demoReplies());
  useSeenReplies.setState({ loaded: true, seen: new Set(initial) });
}

export async function markReplySeen(id: string) {
  await loadSeenReplies();
  const seen = new Set(useSeenReplies.getState().seen);
  if (seen.has(id)) return;
  seen.add(id);
  useSeenReplies.setState({ seen });
  await kv.setItem(KEY, JSON.stringify([...seen]));
}
