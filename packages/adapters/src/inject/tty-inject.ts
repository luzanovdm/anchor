import { promises as fs } from 'node:fs';
import type { InjectResult, InjectTarget, Injector } from '@anchor/core';

const ESC = '\x1b';
const BRACKET_START = `${ESC}[200~`;
const BRACKET_END = `${ESC}[201~`;
const SUBMIT = '\r';

/**
 * Primary strategy: write a bracketed-paste sequence straight to the session's
 * TTY device. Bracketed paste lets the agent treat a multi-line body as one
 * paste rather than line-by-line input.
 *
 * NOTE (spike #1): modern macOS restricts injecting into another process's
 * input queue (TIOCSTI is gated). Where that applies this returns `ok: false`
 * and the runner falls through to the clipboard strategy.
 */
export class TtyInjector implements Injector {
  readonly kind = 'tty' as const;

  async inject(target: InjectTarget, payload: string): Promise<InjectResult> {
    if (target.tty === null) {
      return { ok: false, strategy: 'tty', error: 'session has no tty' };
    }
    const data = `${BRACKET_START}${payload}${BRACKET_END}${SUBMIT}`;
    try {
      const handle = await fs.open(target.tty, 'a');
      try {
        await handle.write(data);
      } finally {
        await handle.close();
      }
      return { ok: true, strategy: 'tty' };
    } catch (err) {
      return { ok: false, strategy: 'tty', error: errorMessage(err) };
    }
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
