import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ChipSize = 'sm' | 'md';
export type ChipTone = 'default' | 'mono' | 'accent';

/**
 * Compact pill-shaped chip used for preset toggles (cron presets in
 * mail campaigns), variable hints (read-only spans), and other
 * one-line labels that group naturally inside `.chip-group` containers.
 *
 * Apply as an attribute on either `<button>` (clickable / toggleable
 * with `[active]`) or `<span>` (read-only). The selector accepts both.
 */
@Component({
  selector: 'button[ttChip], span[ttChip], a[ttChip]',
  templateUrl: './chip.component.html',
  styleUrl: './chip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]':
      "'tt-chip tt-chip-' + size() + ' tt-chip-tone-' + tone()",
    '[class.is-active]': 'active()',
  },
})
export class ChipComponent {
  public readonly size = input<ChipSize>('sm');
  public readonly tone = input<ChipTone>('default');
  public readonly active = input(false);
}
