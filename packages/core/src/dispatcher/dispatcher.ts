import type { GateMode, InjectResult, QueueEntry, SessionKey, TurnState } from '../contract.js';
import type { QueueStore } from './queue-store.js';

/** An already-assembled message ready to inject (rendered body + attachments). */
export interface PreparedMessage {
  readonly draftId: string;
  readonly body: string;
  readonly attachments: readonly string[];
}

export interface DispatchDeps {
  readonly queue: QueueStore;
  readonly turnStateOf: (key: SessionKey) => TurnState;
  readonly gateOf: (key: SessionKey) => GateMode;
  /** Perform the real injection of a built message into the session. */
  readonly inject: (key: SessionKey, message: PreparedMessage) => Promise<InjectResult>;
  readonly now: () => number;
}

/**
 * Queue + gate + per-session mutex. Sends exactly one message per turn boundary
 * and never interleaves into a tool-loop: while an injection is in flight for a
 * session, no other injection for that session starts until the next
 * `turn-finalized` arrives.
 */
export class Dispatcher {
  private readonly inFlight = new Set<SessionKey>();
  private seq = 0;

  constructor(private readonly deps: DispatchDeps) {}

  /**
   * Enqueue durably first, then inject immediately only when the session is idle,
   * its queue was empty, and the auto-gate is on. Otherwise the message waits.
   */
  async send(sessionKey: SessionKey, message: PreparedMessage): Promise<void> {
    const pendingBefore = await this.deps.queue.pending(sessionKey);
    const entry = this.makeEntry(message);
    await this.deps.queue.enqueue(sessionKey, entry);

    const canSendNow =
      pendingBefore.length === 0 &&
      !this.inFlight.has(sessionKey) &&
      this.deps.gateOf(sessionKey) === 'auto' &&
      this.deps.turnStateOf(sessionKey) === 'idle';

    if (canSendNow) await this.pumpOne(sessionKey);
  }

  /** Auto-gate trigger: the session just finished a turn. Send one if queued. */
  async onTurnFinalized(sessionKey: SessionKey): Promise<void> {
    if (this.deps.gateOf(sessionKey) !== 'auto') return;
    await this.pumpOne(sessionKey);
  }

  /** Manual gate: user pressed "Send next". Sends the head regardless of gate. */
  async sendNext(sessionKey: SessionKey): Promise<InjectResult | null> {
    return this.pumpOne(sessionKey);
  }

  /** Inject exactly one queued head, guarded by the per-session mutex. */
  private async pumpOne(sessionKey: SessionKey): Promise<InjectResult | null> {
    if (this.inFlight.has(sessionKey)) return null;
    const head = await this.deps.queue.head(sessionKey);
    if (head === null) return null;

    this.inFlight.add(sessionKey);
    try {
      const message: PreparedMessage = {
        draftId: head.draftId,
        body: head.body,
        attachments: head.attachments,
      };
      const result = await this.deps.inject(sessionKey, message);
      await this.deps.queue.mark(
        sessionKey,
        head.id,
        result.ok ? 'sent' : 'failed',
        result.ok ? undefined : result.error,
      );
      return result;
    } finally {
      this.inFlight.delete(sessionKey);
    }
  }

  private makeEntry(message: PreparedMessage): QueueEntry {
    this.seq += 1;
    const now = this.deps.now();
    return {
      id: `${now.toString(36)}-${this.seq.toString(36)}`,
      draftId: message.draftId,
      body: message.body,
      attachments: [...message.attachments],
      enqueuedAt: now,
      status: 'queued',
    };
  }
}
