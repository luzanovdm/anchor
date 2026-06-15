import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  AgentAdapter,
  TranscriptDiscoverable,
  TranscriptEvent,
  TranscriptSession,
} from '@anchor/core';
import { isRecord, listRolloutsByMtime, newestRollout, parseTimestamp } from './jsonl.js';

/** Rollouts touched within this window count as currently-open sessions. */
const ACTIVE_WINDOW_MS = 20 * 60 * 1000;
/** Cap how many recent sessions we surface, to avoid clutter. */
const MAX_ACTIVE = 8;

/**
 * Codex adapter.
 * Transcripts: `~/.codex/sessions/**\/rollout-*.jsonl`, active = freshest mtime.
 * Codex's event shape is less stable than Claude's, so turn detection here is
 * best-effort; if it proves noisy the session should fall back to `manual` gate.
 */
export class CodexAdapter implements AgentAdapter, TranscriptDiscoverable {
  readonly kind = 'codex' as const;
  readonly processNames = ['codex'] as const;
  // TTY injection into Codex is unproven — prefer clipboard paste first
  readonly injectStrategies = ['clipboard', 'tty'] as const;

  /**
   * Codex (desktop / IDE) sessions have no controlling tty, so `ps` can't find
   * them. They do write rollout transcripts, each tagged with its cwd and id —
   * so we surface the recently-active rollouts as sessions directly.
   */
  async discoverFromTranscripts(now: number): Promise<readonly TranscriptSession[]> {
    const root = join(homedir(), '.codex', 'sessions');
    const rollouts = await listRolloutsByMtime(root); // newest first
    const out: TranscriptSession[] = [];
    for (const path of rollouts) {
      if (out.length >= MAX_ACTIVE) break;
      let mtimeMs: number;
      try {
        mtimeMs = (await fs.stat(path)).mtimeMs;
      } catch {
        continue;
      }
      if (now - mtimeMs > ACTIVE_WINDOW_MS) break; // older files only follow
      const meta = await readSessionMeta(path);
      if (meta === null) continue;
      out.push({
        sessionId: meta.id,
        cwd: meta.cwd,
        transcriptPath: path,
        title: meta.title,
        lastActivityAt: mtimeMs,
      });
    }
    return out;
  }

  async locateTranscript(_cwd: string): Promise<string | null> {
    return newestRollout(join(homedir(), '.codex', 'sessions'));
  }

  async listTranscripts(_cwd: string): Promise<readonly string[]> {
    return listRolloutsByMtime(join(homedir(), '.codex', 'sessions'));
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
    // codex wraps the real record in `payload`; fall back to the top level
    const payload = isRecord(obj['payload']) ? obj['payload'] : obj;
    const pType = stringField(payload, 'type') ?? stringField(obj, 'type');
    const role = stringField(payload, 'role') ?? stringField(obj, 'role');

    // a function/tool call or its output means the turn is still running
    if (pType !== null && /(function_call|call_output|reasoning|tool)/.test(pType)) {
      return { role: 'tool', ts, isFinalAssistant: false };
    }
    if (role === 'assistant') {
      const text = codexText(payload);
      return { role: 'assistant', ts, isFinalAssistant: true, ...(text ? { text } : {}) };
    }
    if (role === 'user') {
      const text = codexText(payload);
      return { role: 'user', ts, isFinalAssistant: false, ...(text ? { text } : {}) };
    }
    // developer/system prompts and event_msg bookkeeping are noise
    return null;
  }

  extractTitle(raw: string): string | null {
    const obj: unknown = JSON.parse(raw);
    if (!isRecord(obj)) return null;
    const payload = obj['payload'];
    if (isRecord(payload) && typeof payload['title'] === 'string') return payload['title'];
    if (typeof obj['title'] === 'string') return obj['title'];
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

interface CodexMeta {
  readonly id: string;
  readonly cwd: string;
  readonly title: string | null;
}

/** Read the leading `session_meta` record (cwd + id) from a rollout. */
async function readSessionMeta(path: string): Promise<CodexMeta | null> {
  let head: string;
  try {
    const handle = await fs.open(path, 'r');
    try {
      // the session_meta line embeds base_instructions and can be tens of KB
      const buf = Buffer.alloc(256 * 1024);
      const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
      head = buf.toString('utf8', 0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
  for (const line of head.split('\n')) {
    if (line.trim().length === 0) continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      break; // first line truncated by the read window
    }
    if (!isRecord(obj) || obj['type'] !== 'session_meta') continue;
    const payload = obj['payload'];
    if (!isRecord(payload)) return null;
    const id = payload['id'];
    const cwd = payload['cwd'];
    if (typeof id !== 'string' || typeof cwd !== 'string') return null;
    const title = typeof payload['title'] === 'string' ? payload['title'] : null;
    return { id, cwd, title };
  }
  return null;
}

/** Pull readable text from a Codex message payload (`content[]` of typed parts). */
function codexText(payload: Record<string, unknown>): string {
  const direct = payload['text'];
  if (typeof direct === 'string') return direct.trim();
  const content = payload['content'];
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const part of content) {
    if (isRecord(part) && typeof part['text'] === 'string') parts.push(part['text']);
  }
  return parts.join('').trim();
}
