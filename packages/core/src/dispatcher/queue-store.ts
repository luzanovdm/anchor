import type { QueueEntry, SessionKey } from '../contract.js';
import type { AnchorPaths } from '../paths.js';
import { appendJsonl, readJsonl, rewriteJsonl } from '../durable/atomic-file.js';

/**
 * Durable per-session FIFO. Backed by `queue/<session-key>.jsonl`; survives
 * restart so a power loss can't drop pending sends.
 */
export class QueueStore {
  constructor(private readonly paths: AnchorPaths) {}

  async list(sessionKey: SessionKey): Promise<QueueEntry[]> {
    return readJsonl<QueueEntry>(this.paths.queueFile(sessionKey));
  }

  async pending(sessionKey: SessionKey): Promise<QueueEntry[]> {
    const all = await this.list(sessionKey);
    return all.filter((e) => e.status === 'queued');
  }

  async enqueue(sessionKey: SessionKey, entry: QueueEntry): Promise<void> {
    await appendJsonl(this.paths.queueFile(sessionKey), entry);
  }

  async head(sessionKey: SessionKey): Promise<QueueEntry | null> {
    const pending = await this.pending(sessionKey);
    return pending[0] ?? null;
  }

  async mark(sessionKey: SessionKey, entryId: string, status: QueueEntry['status'], error?: string): Promise<void> {
    const all = await this.list(sessionKey);
    const next = all.map((e) =>
      e.id === entryId ? { ...e, status, ...(error !== undefined ? { error } : {}) } : e,
    );
    await rewriteJsonl(this.paths.queueFile(sessionKey), next);
  }

  async cancel(sessionKey: SessionKey, entryId: string): Promise<void> {
    const all = await this.list(sessionKey);
    await rewriteJsonl(
      this.paths.queueFile(sessionKey),
      all.filter((e) => e.id !== entryId),
    );
  }

  /** Reorder a still-queued entry; sent/failed entries keep their order. */
  async reorder(sessionKey: SessionKey, entryId: string, toIndex: number): Promise<void> {
    const all = await this.list(sessionKey);
    const queued = all.filter((e) => e.status === 'queued');
    const rest = all.filter((e) => e.status !== 'queued');
    const from = queued.findIndex((e) => e.id === entryId);
    if (from === -1) return;
    const [moved] = queued.splice(from, 1);
    if (moved === undefined) return;
    const clamped = Math.max(0, Math.min(toIndex, queued.length));
    queued.splice(clamped, 0, moved);
    await rewriteJsonl(this.paths.queueFile(sessionKey), [...rest, ...queued]);
  }
}
