import type { InjectResult, InjectStrategyKind, InjectTarget, Injector } from '@anchor/core';
import { TtyInjector } from './tty-inject.js';
import { ClipboardInjector } from './clipboard-inject.js';

/**
 * Runs injection strategies in the adapter's preferred order, returning the
 * first success. If every strategy fails, returns the last failure so the
 * dispatcher can mark the queue entry `failed` with a reason.
 */
export class InjectRunner {
  private readonly injectors: Record<InjectStrategyKind, Injector> = {
    tty: new TtyInjector(),
    clipboard: new ClipboardInjector(),
  };

  async run(
    target: InjectTarget,
    payload: string,
    order: readonly InjectStrategyKind[],
  ): Promise<InjectResult> {
    let last: InjectResult = { ok: false, strategy: 'tty', error: 'no strategy attempted' };
    for (const kind of order) {
      last = await this.injectors[kind].inject(target, payload);
      if (last.ok) return last;
    }
    return last;
  }
}
