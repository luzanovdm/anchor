import { join } from 'node:path';
import {
  AnchorPaths,
  Discovery,
  Dispatcher,
  DraftStore,
  QueueStore,
  SessionRegistry,
  SkillStore,
  TranscriptWatcher,
  buildRendered,
  type GateMode,
  type InjectResult,
  type PreparedMessage,
  type SessionInfo,
  type SessionInspect,
  type SessionKey,
  type Skill,
} from '@anchor/core';
import { InjectRunner, defaultAdapters } from '@anchor/adapters';
import { logger } from './logger.js';

/**
 * Composition root for the main process. Owns the durable stores and the live
 * discovery → registry → dispatcher pipeline, and exposes the coarse operations
 * the IPC layer forwards to the renderer.
 */
export class Services {
  readonly paths = new AnchorPaths();
  private readonly adapters = defaultAdapters();
  private readonly drafts = new DraftStore(this.paths);
  private readonly skills = new SkillStore(this.paths);
  private readonly queue = new QueueStore(this.paths);
  private readonly watcher = new TranscriptWatcher();
  private readonly discovery = new Discovery(this.adapters);
  private readonly injectRunner = new InjectRunner();
  private readonly registry: SessionRegistry;
  private readonly dispatcher: Dispatcher;

  constructor() {
    this.registry = new SessionRegistry({
      discovery: this.discovery,
      watcher: this.watcher,
      queue: this.queue,
      adapters: this.adapters,
      paths: this.paths,
    });
    this.dispatcher = new Dispatcher({
      queue: this.queue,
      turnStateOf: (key) => this.registry.turnStateOf(key),
      gateOf: (key) => this.registry.gateOf(key),
      inject: (key, message) => this.injectInto(key, message),
      now: () => Date.now(),
    });
    this.registry.on('turn-finalized', (key) => {
      void this.dispatcher.onTurnFinalized(key).catch((err) =>
        logger.error('dispatcher', 'onTurnFinalized failed', { key, err: String(err) }),
      );
    });
  }

  async start(): Promise<void> {
    await this.skills.ensureSeeded();
    this.registry.start();
  }

  stop(): void {
    this.registry.stop();
    this.watcher.stop();
  }

  onSessionsChanged(cb: (sessions: readonly SessionInfo[]) => void): () => void {
    this.registry.on('changed', cb);
    return () => this.registry.off('changed', cb);
  }

  // ---- drafts -------------------------------------------------------------

  listDrafts() {
    return this.drafts.list();
  }
  createDraft() {
    return this.drafts.create(Date.now());
  }
  loadDraft(id: string) {
    return this.drafts.load(id);
  }
  saveDraft(id: string, body: string) {
    return this.drafts.save(id, body, Date.now());
  }
  setSkills(id: string, skillIds: readonly string[]) {
    return this.drafts.setSkills(id, skillIds, Date.now());
  }
  removeDraft(id: string) {
    return this.drafts.remove(id);
  }
  importFile(draftId: string, srcPath: string) {
    return this.drafts.importFile(draftId, srcPath);
  }
  listSkills(): Promise<Skill[]> {
    return this.skills.list();
  }

  async buildDraft(id: string): Promise<string> {
    const draft = await this.drafts.load(id);
    if (draft === null) throw new Error(`draft not found: ${id}`);
    const skills = await this.skills.list();
    const rendered = buildRendered(draft.body, draft.meta.skillIds, skills);
    await this.drafts.writeRendered(id, rendered);
    return rendered;
  }

  // ---- sessions & dispatch ------------------------------------------------

  listSessions(): readonly SessionInfo[] {
    return this.registry.snapshot();
  }

  async inspectSession(key: SessionKey): Promise<SessionInspect | null> {
    const view = this.watcher.inspect(key);
    if (view === null) return null;
    const all = await this.queue.list(key);
    const sent = all.filter((e) => e.status !== 'queued').reverse();
    return { ...view, sent };
  }
  setGate(key: SessionKey, mode: GateMode): void {
    this.registry.setGate(key, mode);
  }
  listQueue(key: SessionKey) {
    return this.queue.list(key);
  }
  cancelQueue(key: SessionKey, entryId: string) {
    return this.queue.cancel(key, entryId);
  }
  reorderQueue(key: SessionKey, entryId: string, toIndex: number) {
    return this.queue.reorder(key, entryId, toIndex);
  }

  async send(key: SessionKey, draftId: string): Promise<void> {
    const message = await this.prepare(draftId);
    await this.dispatcher.send(key, message);
  }

  sendNext(key: SessionKey): Promise<InjectResult | null> {
    return this.dispatcher.sendNext(key);
  }

  /** Build the durable message: rendered body + relative attachment paths. */
  private async prepare(draftId: string): Promise<PreparedMessage> {
    const draft = await this.drafts.load(draftId);
    if (draft === null) throw new Error(`draft not found: ${draftId}`);
    const skills = await this.skills.list();
    const body = buildRendered(draft.body, draft.meta.skillIds, skills);
    return {
      draftId,
      body,
      attachments: draft.attachments.map((a) => a.relPath),
    };
  }

  /** Resolve adapter + target, shape the payload, and run injection strategies. */
  private async injectInto(key: SessionKey, message: PreparedMessage): Promise<InjectResult> {
    const adapter = this.registry.adapterFor(key);
    const target = this.registry.injectTargetFor(key);
    if (adapter === null || target === null) {
      return { ok: false, strategy: 'tty', error: 'session no longer live' };
    }
    const draftDir = this.paths.draftDir(message.draftId);
    const absPaths = message.attachments.map((rel) => join(draftDir, rel));
    const payload = adapter.formatForInject(message.body, absPaths);
    const result = await this.injectRunner.run(target, payload, adapter.injectStrategies);
    logger.info('inject', `${result.ok ? 'sent' : 'failed'} via ${result.strategy}`, { key });
    return result;
  }
}
