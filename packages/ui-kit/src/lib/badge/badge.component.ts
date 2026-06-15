import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { resolveTtSize, type TtSize } from '../size';

export type BadgeVariant =
  | 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent'
  | 'locale' | 'mono' | 'ghost'
  | 'blueprint'
  | 'planned'
  | 'pace-ahead' | 'pace-on-track' | 'pace-at-risk' | 'pace-over';
export type BadgeSize = 'sm' | 'md';

const TT_SIZE_TO_BADGE: Record<TtSize, BadgeSize> = {
  '2xs': 'sm',
  xs: 'sm',
  sm: 'sm',
  md: 'md',
  lg: 'md',
  xl: 'md',
};

@Component({
  selector: 'tt-badge',
  templateUrl: './badge.component.html',
  styleUrl: './badge.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'tt-badge tt-badge--' + variant() + ' tt-badge--' + resolvedSize()",
  },
})
export class BadgeComponent {
  public readonly variant = input<BadgeVariant>('default');
  /** Explicit size; when omitted, inherits from a `[ttSize]` ancestor or `md`. */
  public readonly size = input<BadgeSize | null>(null);

  protected readonly resolvedSize = resolveTtSize(this.size, TT_SIZE_TO_BADGE, 'md');
}
