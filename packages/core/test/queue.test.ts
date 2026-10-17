import { describe, expect, it } from 'vitest';
import { MemoryQueueStore, SyncQueue, type SyncTransport } from '../src/sync/queue';
import type { Mutation, SyncPushResponse } from '../src/schemas';
import { DEMO_HISTORY } from '../src/demo/client';

const set = DEMO_HISTORY[0]!.sets[0]!;

/** A fake server that applies set.log idempotently by key, like POST /sync/push. */
class FakeServer implements SyncTransport {
  online = true;
  applied = new Map<string, unknown>();
  seen = new Set<string>();
  rejectKinds = new Set<string>();
  calls = 0;
  async push(mutations: Mutation[]): Promise<SyncPushResponse> {
    this.calls++;
    if (!this.online) throw new Error('Network request failed');
    const res: SyncPushResponse = { accepted: [], rejected: [] };
    for (const m of mutations) {
      if (this.rejectKinds.has(m.kind)) {
        res.rejected.push({ clientMutationId: m.clientMutationId, reason: 'not_found', message: 'This session was removed by your coach.' });
        continue;
      }
      if (!this.seen.has(m.clientMutationId) && m.kind === 'set.log') {
        const p = m.payload;
        this.applied.set(`${p.sessionId}:${p.programExerciseId}:${p.setIndex}`, p);
      }
      this.seen.add(m.clientMutationId);
      res.accepted.push(m.clientMutationId);
    }
    return res;
  }
}

function setup(now = { t: 1_760_000_000_000 }) {
  const store = new MemoryQueueStore();
  const server = new FakeServer();
  const q = new SyncQueue(store, server, { now: () => now.t, baseDelayMs: 1000 });
  return { store, server, q, now };
}

describe('SyncQueue', () => {
  it('persists before enqueue resolves, so a killed app keeps the set', async () => {
    const { store, server } = setup();
    server.online = false;
    const q1 = new SyncQueue(store, server);
    await q1.init();
    await q1.enqueue('set.log', set);
    // Simulate the OS killing the app: a fresh queue over the same store.
    const q2 = new SyncQueue(store, server);
    await q2.init();
    expect(q2.pending()).toHaveLength(1);
    expect(q2.status()).toEqual({ kind: 'saved', pending: 1 });
  });

  it('loses zero sets across three offline sessions, then syncs in order', async () => {
    const { server, q, now } = setup();
    await q.init();
    server.online = false;
    let expected = 0;
    for (const s of DEMO_HISTORY.concat(DEMO_HISTORY[0]!)) {
      for (const ls of s.sets) {
        await q.enqueue('set.log', { ...ls, sessionId: ls.sessionId });
        now.t += 1;
      }
      await q.flush(); // fails, offline
      expected = new Set(q.pending().map((p) => p.mutation.clientMutationId)).size;
    }
    expect(q.pending()).toHaveLength(expected);
    server.online = true;
    now.t += 10 * 60_000;
    await q.flush();
    expect(q.pending()).toHaveLength(0);
    expect(q.status()).toEqual({ kind: 'synced' });
    const uniqueKeys = new Set(DEMO_HISTORY.flatMap((s) => s.sets.map((x) => `${x.sessionId}:${x.programExerciseId}:${x.setIndex}`)));
    expect(server.applied.size).toBe(uniqueKeys.size);
  });

  it('backs off exponentially and reports failed after repeated network errors', async () => {
    const { server, q, now } = setup();
    await q.init();
    server.online = false;
    await q.enqueue('set.log', set);
    await q.flush();
    expect(q.pending()[0]!.nextAttemptAt - now.t).toBe(1000);
    await q.flush(); // not due yet: no call
    expect(server.calls).toBe(1);
    now.t += 1000;
    await q.flush();
    expect(q.pending()[0]!.nextAttemptAt - now.t).toBe(2000);
    now.t += 2000;
    await q.flush();
    expect(q.status().kind).toBe('failed');
  });

  it('keeps rejected mutations visible and never drops them', async () => {
    const { server, q } = setup();
    await q.init();
    server.rejectKinds.add('session.finish');
    await q.enqueue('set.log', set);
    await q.enqueue('session.finish', { sessionId: set.sessionId, finishedAt: new Date().toISOString(), feel: 4, note: null });
    await q.flush();
    const status = q.status();
    expect(status).toMatchObject({ kind: 'failed', rejected: 1, message: 'This session was removed by your coach.' });
    expect(q.pending()).toHaveLength(1);
    server.rejectKinds.clear();
    await q.retryAll();
    expect(q.status()).toEqual({ kind: 'synced' });
  });

  it('is idempotent when the same batch is delivered twice', async () => {
    const { server, q } = setup();
    await q.init();
    const m = await q.enqueue('set.log', set);
    await server.push([m]);
    await q.flush();
    expect(server.applied.size).toBe(1);
    expect(q.pending()).toHaveLength(0);
  });

  it('shares one in-flight flush between concurrent callers', async () => {
    const { server, q } = setup();
    await q.init();
    await q.enqueue('set.log', set);
    await Promise.all([q.flush(), q.flush(), q.flush()]);
    expect(server.calls).toBe(1);
  });
});

describe('SyncQueue.wake', () => {
  it('skips backoff for pending items but leaves rejected ones alone', async () => {
    const { server, q } = setup();
    await q.init();
    server.online = false;
    await q.enqueue('set.log', set);
    await q.flush();
    server.online = true;
    server.rejectKinds.add('session.finish');
    await q.enqueue('session.finish', { sessionId: set.sessionId, finishedAt: new Date().toISOString(), feel: null, note: null });
    await q.flush(); // finish rejected; set.log still backing off
    expect(q.pending()).toHaveLength(2);
    await q.wake();
    expect(q.pending().map((p) => p.mutation.kind)).toEqual(['session.finish']);
  });
});
