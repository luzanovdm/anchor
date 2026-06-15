import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import type { SessionKey, TranscriptMessage, SessionLiveView, TurnState } from '../contract.js';
import type { AgentAdapter, TranscriptEvent } from '../ports.js';
import { processCpu } from '../discovery/proc.js';

/** Idle confirmation window: transcript must be quiet this long to finalize. */
export const IDLE_MS = 1500;
const POLL_MS = 500;
const CPU_IDLE_THRESHOLD = 3; // %cpu below which the agent is considered quiet
/** how many recent text messages to retain per session for the inspector */
const HISTORY_LIMIT = 40;

interface Tracked {
  readonly key: SessionKey;
  readonly pid: number;
  readonly adapter: AgentAdapter;
  transcriptPath: string | null;
  offset: number;
  lastGrowthAt: number;
  lastEvent: TranscriptEvent | null;
  state: TurnState;
  finalizedForCurrentTurn: boolean;
  title: string | null;
  history: TranscriptMessage[];
}

export interface WatcherEvents {
  state: [SessionKey, TurnState];
  'turn-finalized': [SessionKey];
}

/**
 * Tails agent transcripts and decides when a turn is finished. A turn finalizes
 * only when all three signals agree:
 *   1. last normalized event is a final assistant message (not tool_use/result);
 *   2. the transcript has not grown for IDLE_MS (any growth = tool-loop, reset);
 *   3. the process CPU is ≈ 0 over the same window.
 * Emits exactly one `turn-finalized` per completed turn.
 */
export class TranscriptWatcher extends EventEmitter<WatcherEvents> {
  private readonly tracked = new Map<SessionKey, Tracked>();
  private timer: NodeJS.Timeout | null = null;

  /** Start (or update) watching a session. Safe to call repeatedly. */
  track(params: {
    key: SessionKey;
    pid: number;
    adapter: AgentAdapter;
    transcriptPath: string | null;
    now: number;
  }): void {
    const existing = this.tracked.get(params.key);
    if (existing !== undefined) {
      if (existing.transcriptPath !== params.transcriptPath) {
        existing.transcriptPath = params.transcriptPath;
        existing.offset = 0;
      }
      return;
    }
    this.tracked.set(params.key, {
      key: params.key,
      pid: params.pid,
      adapter: params.adapter,
      transcriptPath: params.transcriptPath,
      offset: 0,
      lastGrowthAt: params.now,
      lastEvent: null,
      state: 'unknown',
      finalizedForCurrentTurn: false,
      title: null,
      history: [],
    });
    this.ensureRunning();
  }

  /** Live view of a session: title, current output, and recent messages. */
  inspect(key: SessionKey): SessionLiveView | null {
    const t = this.tracked.get(key);
    if (t === undefined) return null;
    const lastAssistant = [...t.history].reverse().find((m) => m.role === 'assistant');
    return {
      key,
      title: t.title,
      turnState: t.state,
      lastOutput: lastAssistant?.text ?? null,
      history: t.history,
    };
  }

  untrack(key: SessionKey): void {
    this.tracked.delete(key);
    if (this.tracked.size === 0) this.stop();
  }

  stateOf(key: SessionKey): TurnState {
    return this.tracked.get(key)?.state ?? 'unknown';
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private ensureRunning(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_MS);
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    await Promise.all([...this.tracked.values()].map((t) => this.evaluate(t, now)));
  }

  private async evaluate(t: Tracked, now: number): Promise<void> {
    const grew = await this.drainNewLines(t, now);

    // explicit lifecycle events (e.g. Codex task_complete) are authoritative and
    // override the quiet/CPU heuristic — needed for process-less GUI sessions.
    const boundary = t.lastEvent?.turnBoundary;
    if (boundary === 'end') {
      this.setState(t, 'idle');
      if (!t.finalizedForCurrentTurn) {
        t.finalizedForCurrentTurn = true;
        this.emit('turn-finalized', t.key);
      }
      return;
    }
    if (boundary === 'start') {
      this.setState(t, 'working');
      t.finalizedForCurrentTurn = false;
      return;
    }

    if (grew) {
      // any growth means the turn is still in progress (thinking or tool-loop)
      this.setState(t, 'working');
      t.finalizedForCurrentTurn = false;
      return;
    }

    const quietLongEnough = now - t.lastGrowthAt >= IDLE_MS;
    const endsOnAssistant = t.lastEvent?.isFinalAssistant === true;
    if (!quietLongEnough || !endsOnAssistant) {
      if (t.state === 'unknown' && t.lastEvent !== null) this.setState(t, 'working');
      return;
    }

    const cpu = await processCpu(t.pid);
    const cpuQuiet = cpu === null || cpu <= CPU_IDLE_THRESHOLD;
    if (!cpuQuiet) {
      this.setState(t, 'working');
      return;
    }

    this.setState(t, 'idle');
    if (!t.finalizedForCurrentTurn) {
      t.finalizedForCurrentTurn = true;
      this.emit('turn-finalized', t.key);
    }
  }

  /** Read bytes appended since last offset; returns true if the file grew. */
  private async drainNewLines(t: Tracked, now: number): Promise<boolean> {
    if (t.transcriptPath === null) return false;
    let size: number;
    try {
      const stat = await fs.stat(t.transcriptPath);
      size = stat.size;
    } catch {
      return false;
    }
    if (size < t.offset) t.offset = 0; // rotated / truncated
    if (size === t.offset) return false;

    const handle = await fs.open(t.transcriptPath, 'r');
    try {
      const length = size - t.offset;
      const buf = Buffer.alloc(length);
      await handle.read(buf, 0, length, t.offset);
      t.offset = size;
      const chunk = buf.toString('utf8');
      for (const line of chunk.split('\n')) {
        if (line.trim().length === 0) continue;
        const title = safeTitle(t.adapter, line);
        if (title !== null) t.title = title;
        const event = safeParse(t.adapter, line);
        if (event === null) continue;
        t.lastEvent = event;
        if (event.text !== undefined && event.text.length > 0) {
          t.history.push({ role: event.role, text: event.text, ts: event.ts });
          if (t.history.length > HISTORY_LIMIT) t.history.shift();
        }
      }
      t.lastGrowthAt = now;
      return true;
    } finally {
      await handle.close();
    }
  }

  private setState(t: Tracked, state: TurnState): void {
    if (t.state === state) return;
    t.state = state;
    this.emit('state', t.key, state);
  }
}

function safeParse(adapter: AgentAdapter, line: string): TranscriptEvent | null {
  try {
    return adapter.parseLine(line);
  } catch {
    return null;
  }
}

function safeTitle(adapter: AgentAdapter, line: string): string | null {
  try {
    return adapter.extractTitle(line);
  } catch {
    return null;
  }
}
