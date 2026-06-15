import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type EyebrowTone = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
export type EyebrowSize = 'sm' | 'md';

@Component({
  selector: 'tt-eyebrow',
  templateUrl: './eyebrow.component.html',
  styleUrl: './eyebrow.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'tone-' + tone() + ' size-' + size()",
    '[class.has-dot]': 'dot()',
  },
})
export class EyebrowComponent {
  public readonly tone = input<EyebrowTone>('accent');
  public readonly size = input<EyebrowSize>('md');
  public readonly dot = input(false);
}
