import { Injectable, signal, computed, effect, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, timer } from 'rxjs';
import type {
  Draft,
  DraftMeta,
  GateMode,
  QueueEntry,
  SessionInfo,
  SessionInspect,
  SessionKey,
  Skill,
} from '@anchor/core';
import { anchor } from './anchor';

/** How often the inspector / queue refresh for the active target. */
const INSPECT_POLL_MS = 1200;

/** Debounce window for durable autosave — matches the 300 ms spec. */
const AUTOSAVE_MS = 300;

export type ToastTone = 'info' | 'success' | 'danger';
export interface Toast {
  readonly id: number;
  readonly text: string;
  readonly tone: ToastTone;
}

/** App-wide reactive state. The renderer mirrors the durable files on disk. */
@Injectable({ providedIn: 'root' })
export class AnchorStore {
  private readonly destroyRef = inject(DestroyRef);

  readonly sessions = signal<readonly SessionInfo[]>([]);
  readonly drafts = signal<readonly DraftMeta[]>([]);
  readonly skills = signal<readonly Skill[]>([]);
  readonly currentDraft = signal<Draft | null>(null);
  readonly saving = signal<boolean>(false);
  readonly toasts = signal<readonly Toast[]>([]);

  /** key of the session the composer will send to */
  readonly selectedTarget = signal<SessionKey | null>(null);
  /** live inspector view (title, output, history) of the active target */
  readonly inspect = signal<SessionInspect | null>(null);
  /** pending (still-queued) messages for the active target, for DnD reorder */
  readonly pendingQueue = signal<readonly QueueEntry[]>([]);

  readonly liveSessions = computed(() => this.sessions().filter((s) => s.liveness === 'live'));
  readonly currentSkillIds = computed(() => this.currentDraft()?.meta.skillIds ?? []);
  readonly targetSession = computed(
    () => this.liveSessions().find((s) => s.key === this.selectedTarget()) ?? null,
  );
  readonly canSend = computed(
    () => this.targetSession() !== null && (this.currentDraft()?.body.trim().length ?? 0) > 0,
  );

  private readonly bodyInput = new Subject<{ id: string; body: string }>();
  private toastSeq = 0;

  constructor() {
    this.bodyInput
      .pipe(debounceTime(AUTOSAVE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ id, body }) => void this.flushSave(id, body));

    // keep a valid target selected as sessions come and go
    effect(() => {
      const sessions = this.liveSessions();
      const current = this.selectedTarget();
      if (current !== null && sessions.some((s) => s.key === current)) return;
      const next = sessions.find((s) => s.turnState === 'idle') ?? sessions[0] ?? null;
      this.selectedTarget.set(next?.key ?? null);
    });

    // poll the active target's live view + queue
    timer(0, INSPECT_POLL_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.refreshTarget());
  }

  private async refreshTarget(): Promise<void> {
    const key = this.selectedTarget();
    if (key === null) {
      this.inspect.set(null);
      this.pendingQueue.set([]);
      return;
    }
    const [view, queue] = await Promise.all([
      anchor.sessions.inspect(key),
      anchor.queue.list(key),
    ]);
    // ignore late responses after the target changed
    if (this.selectedTarget() !== key) return;
    this.inspect.set(view);
    this.pendingQueue.set(queue.filter((e) => e.status === 'queued'));
  }

  async reorderQueue(fromIndex: number, toIndex: number): Promise<void> {
    const key = this.selectedTarget();
    const entry = this.pendingQueue()[fromIndex];
    if (key === null || entry === undefined) return;
    // optimistic local move so the drag feels instant
    const next = [...this.pendingQueue()];
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, entry);
    this.pendingQueue.set(next);
    await anchor.queue.reorder(key, entry.id, toIndex);
    await this.refreshTarget();
  }

  async cancelQueueEntry(entryId: string): Promise<void> {
    const key = this.selectedTarget();
    if (key === null) return;
    await anchor.queue.cancel(key, entryId);
    await this.refreshTarget();
  }

  async init(): Promise<void> {
    const unsubscribe = anchor.sessions.subscribe((sessions) => this.sessions.set(sessions));
    this.destroyRef.onDestroy(unsubscribe);

    const [sessions, skills, drafts] = await Promise.all([
      anchor.sessions.list(),
      anchor.skills.list(),
      anchor.draft.list(),
    ]);
    this.sessions.set(sessions);
    this.skills.set(skills);
    this.drafts.set(drafts);

    const first = drafts[0];
    if (first !== undefined) await this.selectDraft(first.id);
    else await this.createDraft();
  }

  async createDraft(): Promise<void> {
    const draft = await anchor.draft.create();
    this.currentDraft.set(draft);
    this.drafts.set([draft.meta, ...this.drafts()]);
  }

  async selectDraft(id: string): Promise<void> {
    const draft = await anchor.draft.load(id);
    this.currentDraft.set(draft);
  }

  selectTarget(key: SessionKey): void {
    this.selectedTarget.set(key);
  }

  /** Called on every keystroke — queues the durable autosave. */
  onBodyChange(body: string): void {
    const draft = this.currentDraft();
    if (draft === null) return;
    this.currentDraft.set({ ...draft, body });
    this.saving.set(true);
    this.bodyInput.next({ id: draft.meta.id, body });
  }

  async toggleSkill(skillId: string): Promise<void> {
    const draft = this.currentDraft();
    if (draft === null) return;
    const current = draft.meta.skillIds;
    const next = current.includes(skillId)
      ? current.filter((id) => id !== skillId)
      : [...current, skillId];
    const meta = await anchor.draft.setSkills(draft.meta.id, next);
    this.currentDraft.set({ ...draft, meta });
    this.replaceMeta(meta);
  }

  async importFile(srcPath: string): Promise<string | null> {
    const draft = this.currentDraft();
    if (draft === null) return null;
    const attachment = await anchor.file.import(draft.meta.id, srcPath);
    this.currentDraft.set({ ...draft, attachments: [...draft.attachments, attachment] });
    return attachment.relPath;
  }

  /** Send the current draft to the selected target; report via a toast. */
  async send(): Promise<void> {
    const draft = this.currentDraft();
    const target = this.targetSession();
    if (draft === null || target === null || draft.body.trim().length === 0) return;
    await anchor.dispatch.send(target.key, draft.meta.id);
    const where = `${target.agent} · ${projectName(target)}`;
    if (target.turnState === 'idle' && target.queued === 0) {
      this.pushToast(`Sent to ${where}`, 'success');
    } else {
      this.pushToast(`Queued for ${where}`, 'info');
    }
    await this.createDraft();
    await this.refreshTarget();
  }

  async sendNext(key: SessionKey): Promise<void> {
    const result = await anchor.dispatch.sendNext(key);
    if (result === null) this.pushToast('Queue is empty', 'info');
    else if (result.ok) this.pushToast(`Sent via ${result.strategy}`, 'success');
    else this.pushToast(`Inject failed: ${result.error ?? 'unknown'}`, 'danger');
    await this.refreshTarget();
  }

  async setGate(key: SessionKey, mode: GateMode): Promise<void> {
    await anchor.dispatch.setGate(key, mode);
  }

  dismissToast(id: number): void {
    this.toasts.set(this.toasts().filter((t) => t.id !== id));
  }

  private pushToast(text: string, tone: ToastTone): void {
    const id = ++this.toastSeq;
    this.toasts.set([...this.toasts(), { id, text, tone }]);
    timer(3500)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.dismissToast(id));
  }

  private async flushSave(id: string, body: string): Promise<void> {
    const meta = await anchor.draft.save(id, body);
    this.replaceMeta(meta);
    this.saving.set(false);
  }

  private replaceMeta(meta: DraftMeta): void {
    this.drafts.set(this.drafts().map((m) => (m.id === meta.id ? meta : m)));
  }
}

export function projectName(session: SessionInfo): string {
  return session.cwd.split('/').filter(Boolean).pop() ?? session.cwd;
}

/** Short disambiguating tag: pid for terminal sessions, id tail for the rest. */
export function sessionTag(session: SessionInfo): string {
  if (session.pid > 0) return `#${session.pid}`;
  const id = session.key.split(':').pop() ?? session.key;
  return `…${id.slice(-6)}`;
}
