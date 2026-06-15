import { EventEmitter } from 'node:events';
import type { GateMode, SessionInfo, SessionKey } from './contract.js';
import type { AgentAdapter } from './ports.js';
import type { Discovery, DiscoveredSession } from './discovery/discovery.js';
import type { TranscriptWatcher } from './watcher/transcript-watcher.js';
import type { QueueStore } from './dispatcher/queue-store.js';
import { ttyDevice } from './discovery/proc.js';
import { writeJson } from './durable/atomic-file.js';
import type { AnchorPaths } from './paths.js';

export const DISCOVERY_INTERVAL_MS = 1500;

interface RegistryEvents {
  changed: [readonly SessionInfo[]];
  'turn-finalized': [SessionKey];
}

/**
 * Live source of truth for active sessions. Drives discovery on an interval,
 * keeps the watcher tracking the right transcripts, folds in turn-state and
 * queue depth, and emits a fresh snapshot whenever anything changes.
 */
export class SessionRegistry extends EventEmitter<RegistryEvents> {
  private readonly sessions = new Map<SessionKey, SessionInfo>();
  private readonly discovered = new Map<SessionKey, DiscoveredSession>();
  private readonly gateOverride = new Map<SessionKey, GateMode>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly deps: {
      discovery: Discovery;
      watcher: TranscriptWatcher;
      queue: QueueStore;
      adapters: readonly AgentAdapter[];
      paths: AnchorPaths;
    },
  ) {
    super();
    this.deps.watcher.on('state', () => this.rebuild());
    this.deps.watcher.on('turn-finalized', (key) => {
      this.rebuild();
      this.emit('turn-finalized', key);
    });
  }

  start(): void {
    if (this.timer !== null) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), DISCOVERY_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  snapshot(): readonly SessionInfo[] {
    return [...this.sessions.values()];
  }

  turnStateOf(key: SessionKey): SessionInfo['turnState'] {
    return this.deps.watcher.stateOf(key);
  }

  gateOf(key: SessionKey): GateMode {
    return this.gateOverride.get(key) ?? 'auto';
  }

  setGate(key: SessionKey, mode: GateMode): void {
    this.gateOverride.set(key, mode);
    void this.rebuild();
  }

  adapterFor(key: SessionKey): AgentAdapter | null {
    const session = this.discovered.get(key);
    if (session === undefined) return null;
    return this.deps.adapters.find((a) => a.kind === session.agent) ?? null;
  }

  injectTargetFor(key: SessionKey): { pid: number; tty: string | null; app: string | null } | null {
    const session = this.discovered.get(key);
    if (session === undefined) return null;
    const adapter = this.deps.adapters.find((a) => a.kind === session.agent);
    return {
      pid: session.pid,
      tty: ttyDevice(session.tty),
      app: adapter?.desktopApp ?? null,
    };
  }

  private async poll(): Promise<void> {
    const now = Date.now();
    const found = await this.deps.discovery.scan();
    const foundKeys = new Set(found.map((s) => s.key));

    for (const session of found) {
      const adapter = this.deps.adapters.find((a) => a.kind === session.agent);
      if (adapter === undefined) continue;
      this.discovered.set(session.key, session);
      this.deps.watcher.track({
        key: session.key,
        pid: session.pid,
        adapter,
        transcriptPath: session.transcriptPath,
        now,
      });
    }

    // sessions that vanished from `ps` are dead — drop them and stop watching
    for (const key of [...this.discovered.keys()]) {
      if (!foundKeys.has(key)) {
        this.discovered.delete(key);
        this.deps.watcher.untrack(key);
        this.gateOverride.delete(key);
      }
    }

    await this.rebuild(now);
  }

  private async rebuild(now: number = Date.now()): Promise<void> {
    const next = new Map<SessionKey, SessionInfo>();
    for (const session of this.discovered.values()) {
      const queued = (await this.deps.queue.pending(session.key)).length;
      next.set(session.key, {
        key: session.key,
        agent: session.agent,
        cwd: session.cwd,
        branch: session.branch,
        pid: session.pid,
        tty: ttyDevice(session.tty),
        transcriptPath: session.transcriptPath,
        turnState: this.deps.watcher.stateOf(session.key),
        liveness: 'live',
        lastActivityAt: now,
        gate: this.gateOf(session.key),
        queued,
      });
    }
    this.sessions.clear();
    for (const [key, info] of next) this.sessions.set(key, info);

    await writeJson(this.deps.paths.sessionsSnapshot(), this.snapshot()).catch(() => undefined);
    this.emit('changed', this.snapshot());
  }
}
