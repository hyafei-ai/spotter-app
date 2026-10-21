import { kv } from './storage';
import { syncQueue } from './sync';

/**
 * Tells the coach's churn check that the client opened the app (K-2: "no opens for 7 days").
 * At most once every 6 hours, so the queue never fills with opens.
 */
const KEY = 'spotter.lastAppOpenSent';
const EVERY_MS = 6 * 3_600_000;

export async function recordAppOpen(now: number = Date.now()): Promise<void> {
  try {
    const last = Number((await kv.getItem(KEY)) ?? 0);
    if (now - last < EVERY_MS) return;
    await kv.setItem(KEY, String(now));
    await syncQueue.enqueue('app.open', { openedAt: new Date(now).toISOString() });
  } catch {
    // Best effort: a missed open only makes the churn check slightly more cautious.
  }
}
