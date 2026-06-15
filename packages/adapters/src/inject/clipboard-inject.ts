import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { InjectResult, InjectTarget, Injector } from '@anchor/core';

const exec = promisify(execFile);

/**
 * Fallback strategy: put the body on the pasteboard, focus the terminal hosting
 * the agent, then send Cmd+V + Return via System Events.
 *
 * Requires Accessibility permission for the app. Focus is resolved from the
 * process that owns the session's controlling TTY (the visible terminal app),
 * since the agent process itself has no window.
 */
export class ClipboardInjector implements Injector {
  readonly kind = 'clipboard' as const;

  async inject(target: InjectTarget, payload: string): Promise<InjectResult> {
    try {
      await pbcopy(payload);
      // GUI sessions (no tty) have multiple windows we can't target, and Enter
      // often won't submit — so we only stage on the clipboard for a manual
      // paste rather than pasting into the wrong window.
      if (target.tty === null && typeof target.app === 'string' && target.app.length > 0) {
        return { ok: true, strategy: 'clipboard', manual: true };
      }
      const appPid = await terminalPidFor(target);
      await activatePid(appPid ?? target.pid);
      await keystrokePaste();
      return { ok: true, strategy: 'clipboard' };
    } catch (err) {
      return { ok: false, strategy: 'clipboard', error: errorMessage(err) };
    }
  }
}

async function pbcopy(text: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = execFile('pbcopy', (err) => (err ? reject(err) : resolve()));
    child.stdin?.end(text);
  });
}

/** Walk up the process tree from the session pid to the owning terminal app. */
async function terminalPidFor(target: InjectTarget): Promise<number | null> {
  let pid = target.pid;
  for (let depth = 0; depth < 8; depth += 1) {
    const parent = await parentPid(pid);
    if (parent === null || parent <= 1) return pid;
    const comm = await commOf(parent);
    if (comm !== null && /terminal|iterm|wezterm|kitty|alacritty|ghostty/i.test(comm)) {
      return parent;
    }
    pid = parent;
  }
  return pid;
}

async function parentPid(pid: number): Promise<number | null> {
  try {
    const { stdout } = await exec('ps', ['-o', 'ppid=', '-p', String(pid)]);
    const value = Number(stdout.trim());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

async function commOf(pid: number): Promise<string | null> {
  try {
    const { stdout } = await exec('ps', ['-o', 'comm=', '-p', String(pid)]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function activatePid(pid: number): Promise<void> {
  await exec('osascript', [
    '-e',
    `tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`,
  ]);
}

async function keystrokePaste(): Promise<void> {
  await exec('osascript', [
    '-e',
    'tell application "System Events" to keystroke "v" using command down',
    '-e',
    'delay 0.05',
    '-e',
    'tell application "System Events" to key code 36',
  ]);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
