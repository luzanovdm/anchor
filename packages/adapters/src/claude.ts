import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentAdapter, TranscriptEvent } from '@anchor/core';
import { isRecord, listJsonlByMtime, newestJsonl, parseTimestamp } from './jsonl.js';

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
    return newestJsonl(this.projectDir(cwd));
  }

  async listTranscripts(cwd: string): Promise<readonly string[]> {
    return listJsonlByMtime(this.projectDir(cwd));
  }

  private projectDir(cwd: string): string {
    const slug = cwd.replace(/\//g, '-');
    return join(homedir(), '.claude', 'projects', slug);
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
      const hasToolUse = blocks.some((b) => b.type === 'tool_use');
      const hasText = blocks.some((b) => b.type === 'text');
      const text = blockText(blocks);
      // assistant text with no pending tool call = the visible end of a turn
      return {
        role: hasToolUse ? 'tool' : 'assistant',
        ts,
        isFinalAssistant: hasText && !hasToolUse,
        ...(text.length > 0 ? { text } : {}),
      };
    }
    if (type === 'user') {
      const blocks = messageContent(obj);
      const isToolResult = blocks.some((b) => b.type === 'tool_result');
      const text = blockText(blocks);
      return {
        role: isToolResult ? 'tool' : 'user',
        ts,
        isFinalAssistant: false,
        ...(text.length > 0 && !isToolResult ? { text } : {}),
      };
    }
    return null; // system / summary / meta lines are noise
  }

  extractTitle(raw: string): string | null {
    const obj: unknown = JSON.parse(raw);
    if (!isRecord(obj)) return null;
    if (obj['type'] === 'summary' && typeof obj['summary'] === 'string') {
      return obj['summary'];
    }
    return null;
  }

  formatForInject(body: string, attachmentAbsPaths: readonly string[]): string {
    if (attachmentAbsPaths.length === 0) return body;
    // Claude reads files itself — pass absolute paths on their own lines
    return `${body}\n\n${attachmentAbsPaths.join('\n')}`;
  }
}

interface ContentBlock {
  readonly type: string;
  readonly text: string;
}

/** Collect content blocks (type + any text) from `obj.message.content`. */
function messageContent(obj: Record<string, unknown>): ContentBlock[] {
  const message = obj['message'];
  if (!isRecord(message)) return [];
  const content = message['content'];
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (!Array.isArray(content)) return [];
  const blocks: ContentBlock[] = [];
  for (const block of content) {
    if (!isRecord(block) || typeof block['type'] !== 'string') continue;
    const text = typeof block['text'] === 'string' ? block['text'] : '';
    blocks.push({ type: block['type'], text });
  }
  return blocks;
}

/** Concatenate the text of all text blocks. */
function blockText(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}
