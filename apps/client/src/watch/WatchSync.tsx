import { useEffect, useRef } from 'react';
import { boundWatchContext } from '@spotter/core';
import { watchNative } from './native';
import { sentOrigins, useWatchContext } from './context';
import { handleInbound } from './inbound';
import { useWatch } from './store';

/**
 * Keeps the watch up to date and takes in what it sends (mounted once in the root layout). Renders nothing.
 * Without the native module (web, Android, iOS builds without SPOTTER_WATCH=1) it does nothing at all.
 */
export function WatchSync() {
  return watchNative.available ? <Live /> : null;
}

function Live() {
  const ctx = useWatchContext();
  const last = useRef('');

  // Phone → watch: the application context, only when something the watch shows has changed.
  useEffect(() => {
    const { sentAt: _sentAt, ...content } = ctx;
    const key = JSON.stringify(content);
    if (key === last.current) return;
    const bounded = boundWatchContext(ctx);
    if (!bounded) return;
    last.current = key;
    useWatch.getState().rememberPlans(bounded.plans, Object.fromEntries(bounded.plans.map((p) => [p.planId, sentOrigins.get(p.planId) ?? []])));
    void watchNative.updateContext(JSON.stringify(bounded)).then(() => useWatch.getState().setLastContextAt(bounded.sentAt));
  }, [ctx]);

  // Watch → phone: drain on start and whenever the native side says something arrived.
  useEffect(() => {
    let busy = false;
    let again = false;
    const drain = async (): Promise<void> => {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        for (const json of await watchNative.drain()) {
          // One bad payload never blocks the rest; each handler is idempotent, so a retry can't duplicate.
          await handleInbound(json).catch(() => 'ignored');
        }
      } finally {
        busy = false;
      }
      if (again) {
        again = false;
        await drain();
      }
    };
    void drain();
    return watchNative.onInbound(() => void drain());
  }, []);

  return null;
}
