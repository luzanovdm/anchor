import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  CdkDrag,
  CdkDragHandle,
  CdkDragPreview,
  CdkDropList,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
import type { TranscriptMessage } from '@anchor/core';
import { AnchorStore, projectName } from '../../core/anchor.store';
import { ComposerPanelComponent } from '../composer/composer-panel.component';

@Component({
  selector: 'ac-session-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ComposerPanelComponent, CdkDropList, CdkDrag, CdkDragHandle, CdkDragPreview],
  templateUrl: './session-view.component.html',
  styleUrl: './session-view.component.scss',
})
export class SessionViewComponent {
  private readonly store = inject(AnchorStore);

  readonly target = this.store.targetSession;
  readonly inspect = this.store.inspect;
  readonly queue = this.store.pendingQueue;

  readonly title = computed(() => {
    const t = this.target();
    if (t === null) return '';
    return this.inspect()?.title ?? `${t.agent} · ${projectName(t)}`;
  });

  /** conversation history with empty/tool noise dropped */
  readonly history = computed<readonly TranscriptMessage[]>(
    () => this.inspect()?.history.filter((m) => m.role !== 'tool' && m.text.trim().length > 0) ?? [],
  );

  project(): string {
    const t = this.target();
    return t === null ? '' : projectName(t);
  }

  drop(event: CdkDragDrop<unknown>): void {
    void this.store.reorderQueue(event.previousIndex, event.currentIndex);
  }

  cancel(entryId: string): void {
    void this.store.cancelQueueEntry(entryId);
  }

  sendNext(): void {
    const t = this.target();
    if (t !== null) void this.store.sendNext(t.key);
  }
}
