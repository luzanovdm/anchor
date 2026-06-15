import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type SpinnerSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'tt-spinner',
  templateUrl: './spinner.component.html',
  styleUrl: './spinner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'tt-spinner-' + size()",
  },
})
export class SpinnerComponent {
  public readonly size = input<SpinnerSize>('md');
}
