import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type CardVariant = 'elevated' | 'outlined' | 'flat' | 'blueprint';

@Component({
  selector: 'tt-card',
  templateUrl: './card.component.html',
  styleUrl: './card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': "'tt-card tt-card--' + variant() + ' tt-card--pad-' + padding()",
    '[class.tt-card--interactive]': 'interactive()',
    '[class.tt-card--bp-corners]': 'blueprintCorners()',
  },
})
export class CardComponent {
  public readonly variant = input<CardVariant>('elevated');
  public readonly interactive = input(false);
  public readonly padding = input<'none' | 'sm' | 'md' | 'lg'>('md');
  public readonly blueprintCorners = input(false);
}
