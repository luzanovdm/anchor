import { Injectable, signal, computed, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime } from 'rxjs';
import type {
  Draft,
  DraftMeta,
  GateMode,
  SessionInfo,
  SessionKey,
  Skill,
} from '@anchor/core';
import { anchor } from './anchor';

/** Debounce window for durable autosave — matches the 300 ms spec. */
const AUTOSAVE_MS = 300;

/** App-wide reactive state. The renderer mirrors the durable files on disk. */
@Injectable({ providedIn: 'root' })
export class AnchorStore {
  private readonly destroyRef = inject(DestroyRef);

  readonly sessions = signal<readonly SessionInfo[]>([]);
  readonly drafts = signal<readonly DraftMeta[]>([]);
  readonly skills = signal<readonly Skill[]>([]);
  readonly currentDraft = signal<Draft | null>(null);
  readonly saving = signal<boolean>(false);

  readonly liveSessions = computed(() => this.sessions().filter((s) => s.liveness === 'live'));
  readonly currentSkillIds = computed(() => this.currentDraft()?.meta.skillIds ?? []);

  private readonly bodyInput = new Subject<{ id: string; body: string }>();

  constructor() {
    this.bodyInput
      .pipe(debounceTime(AUTOSAVE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe(({ id, body }) => void this.flushSave(id, body));
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

  async send(sessionKey: SessionKey): Promise<void> {
    const draft = this.currentDraft();
    if (draft === null) return;
    await anchor.dispatch.send(sessionKey, draft.meta.id);
  }

  sendNext(sessionKey: SessionKey): Promise<unknown> {
    return anchor.dispatch.sendNext(sessionKey);
  }

  async setGate(sessionKey: SessionKey, mode: GateMode): Promise<void> {
    await anchor.dispatch.setGate(sessionKey, mode);
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
