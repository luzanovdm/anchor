import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CdkDrag, CdkDragHandle, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import type { TranscriptMessage } from '@anchor/core';
import type { SessionInfo } from '@anchor/core';
import { AnchorStore, projectName, sessionTag } from '../../core/anchor.store';
import { ComposerPanelComponent } from '../composer/composer-panel.component';

@Component({
  selector: 'ac-session-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ComposerPanelComponent, CdkDropList, CdkDrag, CdkDragHandle],
  templateUrl: './session-view.component.html',
  styleUrl: './session-view.component.scss',
})
export class SessionViewComponent {
  private readonly store = inject(AnchorStore);
  private readonly feed = viewChild<ElementRef<HTMLDivElement>>('feed');

  readonly target = this.store.targetSession;
  readonly inspect = this.store.inspect;
  readonly queue = this.store.pendingQueue;

  readonly editingId = signal<string | null>(null);
  readonly editText = signal('');

  readonly title = computed(() => {
    const t = this.target();
    if (t === null) return '';
    return this.inspect()?.title ?? `${t.agent} · ${projectName(t)}`;
  });

  /** chronological conversation (chat order: oldest → newest), tool noise out */
  readonly history = computed<readonly TranscriptMessage[]>(
    () => this.inspect()?.history.filter((m) => m.role !== 'tool' && m.text.trim().length > 0) ?? [],
  );

  constructor() {
    // keep the chat pinned to the latest message, like a messenger
    effect(() => {
      this.history(); // track new messages
      const el = this.feed()?.nativeElement;
      if (el === undefined) return;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
  }

  project(): string {
    const t = this.target();
    return t === null ? '' : projectName(t);
  }

  tag(session: SessionInfo): string {
    return sessionTag(session);
  }

  drop(event: CdkDragDrop<unknown>): void {
    void this.store.reorderQueue(event.previousIndex, event.currentIndex);
  }

  cancel(entryId: string): void {
    void this.store.cancelQueueEntry(entryId);
  }

  startEdit(entry: { id: string; body: string }): void {
    this.editingId.set(entry.id);
    this.editText.set(entry.body);
  }

  onEditInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement) this.editText.set(target.value);
  }

  saveEdit(entryId: string): void {
    void this.store.editQueueEntry(entryId, this.editText());
    this.editingId.set(null);
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  sendNext(): void {
    const t = this.target();
    if (t !== null) void this.store.sendNext(t.key);
  }
}
