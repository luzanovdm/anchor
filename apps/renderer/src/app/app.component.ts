import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AnchorStore } from './core/anchor.store';
import { SessionsPanelComponent } from './features/sessions/sessions-panel.component';
import { ComposerPanelComponent } from './features/composer/composer-panel.component';

@Component({
  selector: 'ac-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SessionsPanelComponent, ComposerPanelComponent],
  template: `
    <div class="layout">
      <ac-sessions-panel class="sidebar" />
      <ac-composer-panel class="main" />
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
        grid-template-columns: minmax(280px, 340px) 1fr;
        height: 100%;
      }
      .sidebar,
      .main {
        min-height: 0;
        overflow: hidden;
      }
    `,
  ],
})
export class AppComponent {
  private readonly store = inject(AnchorStore);

  constructor() {
    void this.store.init();
  }
}
