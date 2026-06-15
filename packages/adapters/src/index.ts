import type { AgentAdapter } from '@anchor/core';
import { ClaudeAdapter } from './claude.js';
import { CodexAdapter } from './codex.js';

export { ClaudeAdapter } from './claude.js';
export { CodexAdapter } from './codex.js';
export { TtyInjector } from './inject/tty-inject.js';
export { ClipboardInjector } from './inject/clipboard-inject.js';
export { InjectRunner } from './inject/runner.js';

/** Default adapter set wired into the app. Add a new agent here only. */
export function defaultAdapters(): readonly AgentAdapter[] {
  return [new ClaudeAdapter(), new CodexAdapter()];
}
