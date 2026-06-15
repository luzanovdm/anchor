import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AnchorStore } from './core/anchor.store';
import { SessionsPanelComponent } from './features/sessions/sessions-panel.component';
import { SessionViewComponent } from './features/session/session-view.component';

@Component({
  selector: 'ac-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SessionsPanelComponent, SessionViewComponent],
  template: `
    <div class="layout">
      <ac-sessions-panel class="sidebar" />
      <ac-session-view class="main" />
    </div>

    <div class="toasts">
      @for (toast of store.toasts(); track toast.id) {
        <button class="toast" [class]="toast.tone" type="button" (click)="store.dismissToast(toast.id)">
          {{ toast.text }}
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .layout {
        display: grid;
        grid-template-columns: minmax(300px, 360px) 1fr;
        height: 100%;
      }
      .sidebar,
      .main {
        min-height: 0;
        overflow: hidden;
      }
      .toasts {
        position: fixed;
        right: var(--tt-space-4);
        bottom: var(--tt-space-4);
        display: flex;
        flex-direction: column;
        gap: var(--tt-space-2);
        z-index: var(--tt-z-toast);
      }
      .toast {
        padding: var(--tt-space-3) var(--tt-space-4);
        border: 1px solid var(--tt-border);
        border-radius: var(--tt-radius-sm);
        background: var(--tt-bg-tertiary);
        color: var(--tt-text-primary);
        box-shadow: var(--tt-shadow-lg);
        font-size: var(--tt-text-sm);
        cursor: pointer;
        animation: rise var(--tt-transition-base);
      }
      .toast.success {
        border-color: var(--tt-success);
        color: var(--tt-success);
      }
      .toast.danger {
        border-color: var(--tt-danger);
        color: var(--tt-danger);
      }
      @keyframes rise {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .toast {
          animation: none;
        }
      }
    `,
  ],
})
export class AppComponent {
  protected readonly store = inject(AnchorStore);

  constructor() {
    void this.store.init();
  }
}
