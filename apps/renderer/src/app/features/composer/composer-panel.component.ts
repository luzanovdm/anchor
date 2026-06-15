import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ButtonComponent } from '@anchor/ui-kit';
import { AnchorStore } from '../../core/anchor.store';
import { anchorNative } from '../../core/anchor';
import { ComposerEditorComponent } from './composer-editor.component';

@Component({
  selector: 'ac-composer-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ComposerEditorComponent, ButtonComponent],
  templateUrl: './composer-panel.component.html',
  styleUrl: './composer-panel.component.scss',
})
export class ComposerPanelComponent {
  private readonly store = inject(AnchorStore);
  private readonly editor = viewChild<ComposerEditorComponent>('editor');

  readonly draft = this.store.currentDraft;
  readonly skills = this.store.skills;
  readonly saving = this.store.saving;
  readonly selectedSkillIds = this.store.currentSkillIds;

  private loadedId: string | null = null;
  /** suppress the docChange that a programmatic setDoc triggers */
  private suppressChange = false;

  constructor() {
    // reflect a draft switch into the editor without re-triggering autosave
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
