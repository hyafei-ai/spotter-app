import { uuidv7 } from '../ids';
import type { Mutation, MutationKind, PayloadOf, SyncPushResponse } from '../schemas';

/**
 * Persistent outbound mutation queue (Offline and sync, NFR).
 *
 * Every write is stored before enqueue() resolves, so an OS kill after the
 * strike animation never loses a set. Items leave the queue only when the server
 * accepts them. A rejected item stays, visible, until the user retries or the
 * server accepts it; nothing is dropped silently.
 */

export type QueueItemState = 'pending' | 'rejected';

export interface QueuedMutation {
  mutation: Mutation;
  state: QueueItemState;
  attempts: number;
  nextAttemptAt: number;
  lastError: string | null;
}

export interface QueueStore {
  all(): Promise<QueuedMutation[]>;
  put(item: QueuedMutation): Promise<void>;
  remove(ids: string[]): Promise<void>;
}

export interface SyncTransport {
  /** Throws on network/transport failure; resolves with per-item results otherwise. */
  push(mutations: Mutation[]): Promise<SyncPushResponse>;
}

export type SyncStatus =
  | { kind: 'synced' }
  | { kind: 'saved'; pending: number } // waiting for a connection
  | { kind: 'syncing'; pending: number }
  | { kind: 'failed'; pending: number; rejected: number; message: string };

export interface SyncQueueOptions {
  batchSize?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Network failures after which the status turns from "saved" to "failed" with Retry. */
  failAfterAttempts?: number;
  now?: () => number;
}

export class SyncQueue {
  private items = new Map<string, QueuedMutation>();
  private listeners = new Set<(s: SyncStatus) => void>();
  private flushing: Promise<void> | null = null;
  private inFlight = false;
  private readonly opts: Required<SyncQueueOptions>;

  constructor(
    private readonly store: QueueStore,
    private readonly transport: SyncTransport,
    options: SyncQueueOptions = {},
  ) {
    this.opts = {
      batchSize: options.batchSize ?? 50,
      baseDelayMs: options.baseDelayMs ?? 2_000,
      maxDelayMs: options.maxDelayMs ?? 5 * 60_000,
      failAfterAttempts: options.failAfterAttempts ?? 3,
      now: options.now ?? Date.now,
    };
  }

  async init(): Promise<void> {
    const stored = await this.store.all();
    this.items = new Map(stored.map((i) => [i.mutation.clientMutationId, i]));
    this.emit();
  }

  async enqueue<K extends MutationKind>(kind: K, payload: PayloadOf<K>): Promise<Mutation> {
    const now = this.opts.now();
    const mutation = {
      clientMutationId: uuidv7(now),
      createdAt: new Date(now).toISOString(),
      kind,
      payload,
    } as Mutation;
    const item: QueuedMutation = { mutation, state: 'pending', attempts: 0, nextAttemptAt: 0, lastError: null };
    await this.store.put(item);
    this.items.set(mutation.clientMutationId, item);
    this.emit();
    return mutation;
  }

  /** Re-arms rejected and backed-off items for an immediate attempt (the banner's Retry). */
  async retryAll(): Promise<void> {
    for (const item of this.items.values()) {
      const next = { ...item, state: 'pending' as const, nextAttemptAt: 0 };
      this.items.set(item.mutation.clientMutationId, next);
      await this.store.put(next);
    }
    this.emit();
    await this.flush();
  }

  /** Connection is back: skip any backoff wait for pending items. Rejected items stay rejected. */
  async wake(): Promise<void> {
    for (const item of this.items.values()) {
      if (item.state !== 'pending' || item.nextAttemptAt === 0) continue;
      const next = { ...item, nextAttemptAt: 0 };
      this.items.set(item.mutation.clientMutationId, next);
      await this.store.put(next);
    }
    await this.flush();
  }

  /** Single-flight: concurrent callers share the same flush. */
  flush(): Promise<void> {
    if (!this.flushing) {
      this.flushing = this.doFlush().finally(() => {
        this.flushing = null;
        this.inFlight = false;
        this.emit();
      });
    }
    return this.flushing;
  }

  pending(): QueuedMutation[] {
    return [...this.items.values()].sort((a, b) =>
      a.mutation.clientMutationId < b.mutation.clientMutationId ? -1 : 1,
    );
  }

  status(): SyncStatus {
    const all = [...this.items.values()];
    if (all.length === 0) return { kind: 'synced' };
    const rejected = all.filter((i) => i.state === 'rejected');
    const pending = all.length - rejected.length;
    const stuck = all.find((i) => i.state === 'pending' && i.attempts >= this.opts.failAfterAttempts);
    if (rejected.length > 0 || stuck) {
      const message = rejected[0]?.lastError ?? stuck?.lastError ?? 'Could not reach the server.';
      return { kind: 'failed', pending, rejected: rejected.length, message };
    }
    if (this.inFlight) return { kind: 'syncing', pending };
    return { kind: 'saved', pending };
  }

  subscribe(listener: (s: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status());
    return () => this.listeners.delete(listener);
  }

  private emit() {
    const s = this.status();
    for (const l of this.listeners) l(s);
  }

  private backoff(attempts: number): number {
    const exp = this.opts.baseDelayMs * 2 ** Math.max(0, attempts - 1);
    return Math.min(exp, this.opts.maxDelayMs);
  }

  private async doFlush(): Promise<void> {
    // Loop so a long queue drains in several batches during one flush.
    for (;;) {
      const now = this.opts.now();
      const due = this.pending()
        .filter((i) => i.state === 'pending' && i.nextAttemptAt <= now)
        .slice(0, this.opts.batchSize);
      if (due.length === 0) return;

      this.inFlight = true;
      this.emit();

      let res: SyncPushResponse;
      try {
        res = await this.transport.push(due.map((i) => i.mutation));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        for (const item of due) {
          const attempts = item.attempts + 1;
          const next = { ...item, attempts, lastError: message, nextAttemptAt: now + this.backoff(attempts) };
          this.items.set(item.mutation.clientMutationId, next);
          await this.store.put(next);
        }
        return;
      }

      const accepted = new Set(res.accepted);
      const rejected = new Map(res.rejected.map((r) => [r.clientMutationId, r]));
      const done: string[] = [];
      for (const item of due) {
        const id = item.mutation.clientMutationId;
        if (accepted.has(id)) {
          done.push(id);
          continue;
        }
        const r = rejected.get(id);
        const next: QueuedMutation = r
          ? { ...item, state: 'rejected', attempts: item.attempts + 1, lastError: r.message }
          : // Server neither accepted nor rejected it: treat as transient and retry later.
            { ...item, attempts: item.attempts + 1, nextAttemptAt: now + this.backoff(item.attempts + 1), lastError: 'No response for this change.' };
        this.items.set(id, next);
        await this.store.put(next);
      }
      if (done.length) {
        await this.store.remove(done);
        for (const id of done) this.items.delete(id);
      }
      if (done.length === 0) return; // nothing progressed; avoid a hot loop
    }
  }
}

/** In-memory store for tests and for the web demo before storage is ready. */
export class MemoryQueueStore implements QueueStore {
  readonly data = new Map<string, QueuedMutation>();
  async all() {
    return [...this.data.values()].map((i) => JSON.parse(JSON.stringify(i)) as QueuedMutation);
  }
  async put(item: QueuedMutation) {
    this.data.set(item.mutation.clientMutationId, JSON.parse(JSON.stringify(item)) as QueuedMutation);
  }
  async remove(ids: string[]) {
    for (const id of ids) this.data.delete(id);
  }
}
