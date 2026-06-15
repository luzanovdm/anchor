import { computed, Directive, inject, input, type Signal } from '@angular/core';

/** Canonical size scale shared across ui-kit primitives. */
export type TtSize = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Standard interactive control sizes: 32px, 38px, 44px. */
export type TtControlSize = 'sm' | 'md' | 'lg';

export const TT_CONTROL_SIZE_BY_TT_SIZE: Record<TtSize, TtControlSize> = {
  '2xs': 'sm',
  xs: 'sm',
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  xl: 'lg',
};

/**
 * Ambient size context.
 *
 * Host any element with `ttSize="sm"` and every ui-kit descendant that opts in
 * (by resolving its size through {@link resolveTtSize}) inherits that size
 * unless it declares an explicit `size`. Keeps controls that sit together in a
 * row — month nav + segment control + help button, badges, etc. — at one
 * consistent size without threading the size through every call site.
 *
 * ```html
 * <div ttSize="sm">
 *   <tt-month-nav … />
 *   <tt-segment-control … />
 *   <button ttIconButton>…</button>
 * </div>
 * ```
 */
@Directive({
  selector: '[ttSize]',
})
export class TtSizeDirective {
  // Defaulted (not required) so a bare `ttSize` attribute degrades to `md`
  // instead of throwing NG0950 in every ui-kit descendant that reads it.
  public readonly ttSize = input<TtSize>('md');
}

/**
 * Resolve a component's effective size as a reactive signal:
 *
 * 1. an explicit `size` input wins;
 * 2. otherwise the nearest `[ttSize]` ancestor, mapped onto the component's own
 *    scale via `map`;
 * 3. otherwise the component's `fallback` default.
 *
 * Call from a field initializer so the optional `inject` runs in an injection
 * context.
 */
export function resolveTtSize<T extends string>(
  explicit: Signal<T | null | undefined>,
  map: Record<TtSize, T>,
  fallback: T,
): Signal<T> {
  const ctx = inject(TtSizeDirective, { optional: true });
  return computed(() => explicit() ?? (ctx ? map[ctx.ttSize()] : fallback));
}
