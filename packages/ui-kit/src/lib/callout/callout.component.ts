import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type CalloutType = 'info' | 'success' | 'warn' | 'danger';

@Component({
  selector: 'tt-callout',
  templateUrl: './callout.component.html',
  styleUrl: './callout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'note',
    '[class]': "'tone-' + type()",
  },
})
export class CalloutComponent {
  public readonly type = input<CalloutType>('info');
  public readonly title = input<string | null>(null);
}
