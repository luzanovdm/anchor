import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ListItemTone =
  | 'danger'
  | 'expense'
  | 'income'
  | 'neutral'
  | 'system'
  | 'warning';

@Component({
  selector: 'a[tt-list-item], button[tt-list-item], div[tt-list-item]',
  template: '<ng-content />',
  styleUrl: './list-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tt-list-item',
    '[class.is-selected]': 'selected()',
    '[class.is-system]': 'system()',
    '[class.tone-danger]': "tone() === 'danger'",
    '[class.tone-expense]': "tone() === 'expense'",
    '[class.tone-income]': "tone() === 'income'",
    '[class.tone-neutral]': "tone() === 'neutral'",
    '[class.tone-system]': "tone() === 'system'",
    '[class.tone-warning]': "tone() === 'warning'",
  },
})
export class ListItemComponent {
  public readonly selected = input(false);
  public readonly system = input(false);
  public readonly tone = input<ListItemTone>('neutral');
}
