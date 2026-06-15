import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentAdapter, TranscriptEvent } from '@anchor/core';
import { isRecord, newestJsonl, parseTimestamp } from './jsonl.js';

/**
 * Claude Code adapter.
 * Transcripts: `~/.claude/projects/<slug>/<uuid>.jsonl`, slug = cwd with `/`→`-`.
 * A turn is final when an `assistant` line carries text (not only `tool_use`).
 */
export class ClaudeAdapter implements AgentAdapter {
  readonly kind = 'claude' as const;
  readonly processNames = ['claude'] as const;
  readonly injectStrategies = ['tty', 'clipboard'] as const;

  async locateTranscript(cwd: string): Promise<string | null> {
    const slug = cwd.replace(/\//g, '-');
    const dir = join(homedir(), '.claude', 'projects', slug);
    return newestJsonl(dir);
  }

  sessionId(transcriptPath: string | null, pid: number): string {
    if (transcriptPath === null) return `pid-${pid}`;
    const base = transcriptPath.split('/').pop() ?? `pid-${pid}`;
    return base.replace(/\.jsonl$/, '');
  }

  parseLine(raw: string): TranscriptEvent | null {
    const obj: unknown = JSON.parse(raw);
    if (!isRecord(obj)) return null;
    const ts = parseTimestamp(obj['timestamp'], Date.now());
    const type = obj['type'];

    if (type === 'assistant') {
      const blocks = messageContent(obj);
      const hasToolUse = blocks.some((b) => b === 'tool_use');
      const hasText = blocks.some((b) => b === 'text');
      // assistant text with no pending tool call = the visible end of a turn
      return { role: hasToolUse ? 'tool' : 'assistant', ts, isFinalAssistant: hasText && !hasToolUse };
    }
    if (type === 'user') {
      const blocks = messageContent(obj);
      const isToolResult = blocks.some((b) => b === 'tool_result');
      return { role: isToolResult ? 'tool' : 'user', ts, isFinalAssistant: false };
    }
    return null; // system / summary / meta lines are noise
  }

  formatForInject(body: string, attachmentAbsPaths: readonly string[]): string {
    if (attachmentAbsPaths.length === 0) return body;
    // Claude reads files itself — pass absolute paths on their own lines
    return `${body}\n\n${attachmentAbsPaths.join('\n')}`;
  }
}

/** Collect the `type` of each content block in `obj.message.content`. */
function messageContent(obj: Record<string, unknown>): string[] {
  const message = obj['message'];
  if (!isRecord(message)) return [];
  const content = message['content'];
  if (typeof content === 'string') return ['text'];
  if (!Array.isArray(content)) return [];
  const types: string[] = [];
  for (const block of content) {
    if (isRecord(block) && typeof block['type'] === 'string') types.push(block['type']);
  }
  return types;
}
