import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'tt-divider',
  templateUrl: './divider.component.html',
  styleUrl: './divider.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'separator',
    '[class.vertical]': "direction() === 'vertical'",
    '[class.blueprint]': "variant() === 'blueprint'",
    '[class.labelled]': 'label()',
    '[attr.aria-orientation]': 'direction()',
  },
})
export class DividerComponent {
  public readonly direction = input<'horizontal' | 'vertical'>('horizontal');
  public readonly variant = input<'default' | 'blueprint'>('default');
  public readonly label = input<string>('');
}
