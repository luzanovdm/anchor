import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { QueueEntry, SessionInfo, SessionKey } from '@anchor/core';
import {
  BadgeComponent,
  ButtonComponent,
  EmptyStateComponent,
  type BadgeVariant,
} from '@anchor/ui-kit';
import { AnchorStore } from '../../core/anchor.store';
import { anchor } from '../../core/anchor';

@Component({
  selector: 'ac-sessions-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, BadgeComponent, EmptyStateComponent],
  templateUrl: './sessions-panel.component.html',
  styleUrl: './sessions-panel.component.scss',
})
export class SessionsPanelComponent {
  private readonly store = inject(AnchorStore);
  readonly sessions = this.store.liveSessions;

  /** Per-session expanded queue cache, keyed by session key. */
  readonly expanded = signal<SessionKey | null>(null);
  readonly queue = signal<readonly QueueEntry[]>([]);

  projectName(session: SessionInfo): string {
    return session.cwd.split('/').filter(Boolean).pop() ?? session.cwd;
  }

  stateTone(session: SessionInfo): BadgeVariant {
    if (session.turnState === 'idle') return 'success';
    if (session.turnState === 'working') return 'warning';
    return 'default';
  }

  send(session: SessionInfo): void {
    void this.store.send(session.key);
  }

  sendNext(session: SessionInfo): void {
    void this.store.sendNext(session.key);
  }

  toggleGate(session: SessionInfo): void {
    void this.store.setGate(session.key, session.gate === 'auto' ? 'manual' : 'auto');
  }

  async toggleQueue(session: SessionInfo): Promise<void> {
    if (this.expanded() === session.key) {
      this.expanded.set(null);
      return;
    }
    this.expanded.set(session.key);
    this.queue.set(await anchor.queue.list(session.key));
  }

  async cancel(session: SessionInfo, entry: QueueEntry): Promise<void> {
    await anchor.queue.cancel(session.key, entry.id);
    this.queue.set(await anchor.queue.list(session.key));
  }
}
