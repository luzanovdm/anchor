import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { EmptyStateMeta } from './empty-state.model';
import { ButtonComponent } from '../button';

@Component({
  selector: 'tt-empty-state',
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  host: {
    'role': 'status',
    'aria-live': 'polite',
    '[class.tt-empty-state--blueprint]': "variant() === 'blueprint'",
  },
})
export class EmptyStateComponent {
  /** Legacy inputs — used by existing consumers. */
  public readonly heading = input<string>('');
  public readonly description = input<string>('');
  /**
   * CTA label for the inline action button. When set, renders the button
   * even without a `meta` object. Listen to `(ctaClick)` for the action.
   * `meta.ctaLabel` still wins when both are provided.
   */
  public readonly ctaLabel = input<string>('');

  /** Structured content for domain empty states. */
  public readonly meta = input<EmptyStateMeta | null>(null);

  /** Icon animation CSS class (e.g. 'pulse', 'float', 'spin', 'wobble'). */
  public readonly iconAnimation = input<string>('');
  public readonly variant = input<'default' | 'blueprint'>('default');

  /** Emitted when CTA button is clicked (alternative to meta.ctaAction). */
  public readonly ctaClick = output<void>();

  protected readonly resolvedTitle = computed(() => this.meta()?.title ?? this.heading());
  protected readonly resolvedDescription = computed(() => this.meta()?.description ?? this.description());
  protected readonly resolvedCtaLabel = computed(
    () => this.meta()?.ctaLabel ?? (this.ctaLabel() || undefined),
  );

  protected onCtaClick(): void {
    const action = this.meta()?.ctaAction;
    if (action) {
      action();
    }
    this.ctaClick.emit();
  }
}
