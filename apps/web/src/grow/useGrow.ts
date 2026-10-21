'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { defaultGrow, growKey, type GrowState } from './state';

/*
 * MOCK persistence for the demo: Grow state lives in localStorage (keys "spotter.grow.<slug>") until the
 * dashboard is signed in against Supabase. Changes broadcast to other tabs and components.
 */
const EVENT = 'spotter-grow-change';

function read(slug: string): string | null {
  try {
    return localStorage.getItem(growKey(slug));
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function useGrow(slug: string): [GrowState, (next: GrowState | ((s: GrowState) => GrowState)) => void, boolean] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(slug),
    () => null,
  );
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const state = useMemo<GrowState>(() => {
    if (!raw) return defaultGrow(slug);
    try {
      return { ...defaultGrow(slug), ...(JSON.parse(raw) as Partial<GrowState>) };
    } catch {
      return defaultGrow(slug);
    }
  }, [raw, slug]);

  const save = useCallback(
    (next: GrowState | ((s: GrowState) => GrowState)) => {
      const current = (() => {
        const r = read(slug);
        try {
          return r ? { ...defaultGrow(slug), ...(JSON.parse(r) as Partial<GrowState>) } : defaultGrow(slug);
        } catch {
          return defaultGrow(slug);
        }
      })();
      const value = typeof next === 'function' ? next(current) : next;
      try {
        localStorage.setItem(growKey(slug), JSON.stringify(value));
      } catch {
        // Storage full or blocked: the change lives for this page view only.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [slug],
  );

  return [state, save, hydrated];
}
