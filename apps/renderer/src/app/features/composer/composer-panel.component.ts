import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ButtonComponent, ChipComponent, TextareaComponent } from '@anchor/ui-kit';
import type { SessionInfo } from '@anchor/core';
import { AnchorStore, projectName, sessionTag } from '../../core/anchor.store';
import { anchorNative } from '../../core/anchor';

@Component({
  selector: 'ac-composer-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TextareaComponent, ButtonComponent, ChipComponent],
  templateUrl: './composer-panel.component.html',
  styleUrl: './composer-panel.component.scss',
})
export class ComposerPanelComponent {
  private readonly store = inject(AnchorStore);

  readonly draft = this.store.currentDraft;
  readonly skills = this.store.skills;
  readonly saving = this.store.saving;
  readonly sessions = this.store.liveSessions;
  readonly target = this.store.targetSession;
  readonly canSend = this.store.canSend;
  readonly selectedSkillIds = this.store.currentSkillIds;

  readonly body = computed(() => this.draft()?.body ?? '');
  readonly targetMenuOpen = signal(false);

  readonly counts = computed(() => {
    const body = this.body();
    const chars = body.length;
    const lines = body.length === 0 ? 0 : body.split('\n').length;
    return { chars, lines };
  });

  targetLabel(session: SessionInfo): string {
    return `${session.agent} · ${projectName(session)} · ${sessionTag(session)}`;
  }

  onBodyChange(value: string): void {
    this.store.onBodyChange(value);
  }

  onKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      this.send();
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    const files = event.dataTransfer?.files;
    if (files === undefined) return;
    for (const file of Array.from(files)) {
      const srcPath = anchorNative.pathForFile(file);
      if (srcPath.length === 0) continue;
      const relPath = await this.store.importFile(srcPath);
      if (relPath === null) continue;
      const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(srcPath);
      const name = srcPath.split('/').pop() ?? 'file';
      const snippet = isImage ? `![](${relPath})` : `[${name}](${relPath})`;
      const sep = this.body().length === 0 ? '' : '\n';
      this.store.onBodyChange(this.body() + sep + snippet);
    }
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
}
