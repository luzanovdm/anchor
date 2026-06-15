import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentAdapter, TranscriptEvent } from '@anchor/core';
import { isRecord, newestRollout, parseTimestamp } from './jsonl.js';

/**
 * Codex adapter.
 * Transcripts: `~/.codex/sessions/**\/rollout-*.jsonl`, active = freshest mtime.
 * Codex's event shape is less stable than Claude's, so turn detection here is
 * best-effort; if it proves noisy the session should fall back to `manual` gate.
 */
export class CodexAdapter implements AgentAdapter {
  readonly kind = 'codex' as const;
  readonly processNames = ['codex'] as const;
  // TTY injection into Codex is unproven — prefer clipboard paste first
  readonly injectStrategies = ['clipboard', 'tty'] as const;

  async locateTranscript(_cwd: string): Promise<string | null> {
    const root = join(homedir(), '.codex', 'sessions');
    return newestRollout(root);
  }

  sessionId(transcriptPath: string | null, pid: number): string {
    if (transcriptPath === null) return `pid-${pid}`;
    const base = transcriptPath.split('/').pop() ?? `pid-${pid}`;
    return base.replace(/\.jsonl$/, '').replace(/^rollout-/, '');
  }

  parseLine(raw: string): TranscriptEvent | null {
    const obj: unknown = JSON.parse(raw);
    if (!isRecord(obj)) return null;
    const ts = parseTimestamp(obj['timestamp'] ?? obj['ts'], Date.now());
    const type = stringField(obj, 'type');
    const role = stringField(obj, 'role') ?? nestedRole(obj);

    // a function/tool call or its output means the turn is still running
    if (type !== null && /(function_call|tool|call_output|reasoning)/.test(type)) {
      return { role: 'tool', ts, isFinalAssistant: false };
    }
    if (role === 'assistant' || type === 'message') {
      return { role: 'assistant', ts, isFinalAssistant: role === 'assistant' };
    }
    if (role === 'user') {
      return { role: 'user', ts, isFinalAssistant: false };
    }
    return null;
  }

  formatForInject(body: string, attachmentAbsPaths: readonly string[]): string {
    if (attachmentAbsPaths.length === 0) return body;
    return `${body}\n\n${attachmentAbsPaths.join('\n')}`;
  }
}

function stringField(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  return typeof value === 'string' ? value : null;
}

function nestedRole(obj: Record<string, unknown>): string | null {
  const payload = obj['payload'];
  if (isRecord(payload) && typeof payload['role'] === 'string') return payload['role'];
  return null;
}
