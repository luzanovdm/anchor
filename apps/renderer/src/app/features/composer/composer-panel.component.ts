import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { SessionInfo } from '@anchor/core';
import { AnchorStore, projectName } from '../../core/anchor.store';
import { anchorNative } from '../../core/anchor';
import { ComposerEditorComponent } from './composer-editor.component';

@Component({
  selector: 'ac-composer-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ComposerEditorComponent],
  templateUrl: './composer-panel.component.html',
  styleUrl: './composer-panel.component.scss',
})
export class ComposerPanelComponent {
  private readonly store = inject(AnchorStore);
  private readonly editor = viewChild<ComposerEditorComponent>('editor');

  readonly draft = this.store.currentDraft;
  readonly skills = this.store.skills;
  readonly saving = this.store.saving;
  readonly sessions = this.store.liveSessions;
  readonly target = this.store.targetSession;
  readonly canSend = this.store.canSend;
  readonly selectedSkillIds = this.store.currentSkillIds;

  readonly targetMenuOpen = signal(false);

  readonly counts = computed(() => {
    const body = this.draft()?.body ?? '';
    const chars = body.length;
    const lines = body.length === 0 ? 0 : body.split('\n').length;
    return { chars, lines };
  });

  private loadedId: string | null = null;
  private suppressChange = false;

  constructor() {
    effect(() => {
      const draft = this.draft();
      const editor = this.editor();
      if (draft === null || editor === undefined) return;
      if (draft.meta.id === this.loadedId) return;
      this.loadedId = draft.meta.id;
      this.suppressChange = true;
      editor.setDoc(draft.body);
    });
  }

  readonly initialDoc = signal<string>('');

  targetLabel(session: SessionInfo): string {
    return `${session.agent} · ${projectName(session)} · #${session.pid}`;
  }

  onDocChange(body: string): void {
    if (this.suppressChange) {
      this.suppressChange = false;
      return;
    }
    this.store.onBodyChange(body);
  }

  isSelected(skillId: string): boolean {
    return this.selectedSkillIds().includes(skillId);
  }

  toggleSkill(skillId: string): void {
    void this.store.toggleSkill(skillId);
  }

  newDraft(): void {
    void this.store.createDraft();
  }

  send(): void {
    void this.store.send();
  }

  pickTarget(session: SessionInfo): void {
    this.store.selectTarget(session.key);
    this.targetMenuOpen.set(false);
  }

  toggleTargetMenu(): void {
    this.targetMenuOpen.update((v) => !v);
  }

  async onFileDropped(file: File): Promise<void> {
    const srcPath = anchorNative.pathForFile(file);
    if (srcPath.length === 0) return;
    const relPath = await this.store.importFile(srcPath);
    if (relPath === null) return;
    const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(srcPath);
    const name = srcPath.split('/').pop() ?? 'file';
    const snippet = isImage ? `![](${relPath})` : `[${name}](${relPath})`;
    this.editor()?.insertAtCursor(snippet);
  }
}
