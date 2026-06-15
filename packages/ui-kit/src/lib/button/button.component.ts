import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import {
  resolveTtSize,
  TT_CONTROL_SIZE_BY_TT_SIZE,
  type TtControlSize,
} from '../size';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'danger-ghost'
  | 'success';
export type ButtonSize = TtControlSize;

@Component({
  selector: 'button[ttButton], a[ttButton]',
  templateUrl: './button.component.html',
  styleUrl: './button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'tt-btn tt-btn--' + variant() + ' tt-btn--' + resolvedSize()",
    '[class.tt-btn--icon-only]': 'iconOnly()',
    '[class.tt-btn--loading]': 'loading()',
  },
})
export class ButtonComponent {
  public readonly variant = input<ButtonVariant>('primary');
  /** Explicit size; when omitted, inherits from a `[ttSize]` ancestor or `md`. */
  public readonly size = input<ButtonSize | null>(null);
  public readonly loading = input(false);
  public readonly iconOnly = input(false);

  protected readonly resolvedSize = resolveTtSize(
    this.size,
    TT_CONTROL_SIZE_BY_TT_SIZE,
    'md',
  );
}
