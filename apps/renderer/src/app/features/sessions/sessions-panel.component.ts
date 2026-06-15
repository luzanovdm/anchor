import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { QueueEntry, SessionInfo, SessionKey } from '@anchor/core';
import { EmptyStateComponent } from '@anchor/ui-kit';
import { AnchorStore, projectName } from '../../core/anchor.store';
import { anchor } from '../../core/anchor';

@Component({
  selector: 'ac-sessions-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyStateComponent],
  templateUrl: './sessions-panel.component.html',
  styleUrl: './sessions-panel.component.scss',
})
export class SessionsPanelComponent {
  private readonly store = inject(AnchorStore);
  readonly sessions = this.store.liveSessions;
  readonly target = this.store.selectedTarget;

  readonly expanded = signal<SessionKey | null>(null);
  readonly queue = signal<readonly QueueEntry[]>([]);

  readonly idleCount = computed(() => this.sessions().filter((s) => s.turnState === 'idle').length);

  project(session: SessionInfo): string {
    return projectName(session);
  }

  select(session: SessionInfo): void {
    this.store.selectTarget(session.key);
  }

  toggleGate(session: SessionInfo, event: Event): void {
    event.stopPropagation();
    void this.store.setGate(session.key, session.gate === 'auto' ? 'manual' : 'auto');
  }

  sendNext(session: SessionInfo, event: Event): void {
    event.stopPropagation();
    void this.store.sendNext(session.key);
  }

  async toggleQueue(session: SessionInfo, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.expanded() === session.key) {
      this.expanded.set(null);
      return;
    }
    this.expanded.set(session.key);
    this.queue.set(await anchor.queue.list(session.key));
  }

  async cancel(session: SessionInfo, entry: QueueEntry, event: Event): Promise<void> {
    event.stopPropagation();
    await anchor.queue.cancel(session.key, entry.id);
    this.queue.set(await anchor.queue.list(session.key));
  }
}
