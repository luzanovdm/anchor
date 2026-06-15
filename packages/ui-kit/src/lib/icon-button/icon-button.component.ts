import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { resolveTtSize, type TtControlSize, type TtSize } from '../size';

export type IconButtonSize = 'xs' | TtControlSize;
export type IconButtonTone = 'neutral' | 'danger';

const TT_SIZE_TO_ICON_BUTTON: Record<TtSize, IconButtonSize> = {
  '2xs': 'xs',
  xs: 'xs',
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'lg',
};

@Component({
  selector: 'button[ttIconButton]',
  templateUrl: './icon-button.component.html',
  styleUrl: './icon-button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tt-icon-btn',
    '[class.xs]': "resolvedSize() === 'xs'",
    '[class.sm]': "resolvedSize() === 'sm'",
    '[class.md]': "resolvedSize() === 'md'",
    '[class.lg]': "resolvedSize() === 'lg'",
    '[class.tone-danger]': "tone() === 'danger'",
  },
})
export class IconButtonComponent {
  /** Explicit size; when omitted, inherits from a `[ttSize]` ancestor or `md`. */
  public readonly size = input<IconButtonSize | null>(null);
  public readonly tone = input<IconButtonTone>('neutral');

  protected readonly resolvedSize = resolveTtSize(this.size, TT_SIZE_TO_ICON_BUTTON, 'md');
}
