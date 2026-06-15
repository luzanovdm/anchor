import type { AgentKind, InjectResult } from './contract.js';

/** A normalized transcript event — adapters map raw JSONL lines into these. */
export interface TranscriptEvent {
  readonly role: 'user' | 'assistant' | 'tool';
  readonly ts: number;
  /** true only for an assistant message that is NOT a tool_use (turn boundary) */
  readonly isFinalAssistant: boolean;
  /** human-readable text of the message, when present (for the inspector) */
  readonly text?: string;
}

export type InjectStrategyKind = 'tty' | 'clipboard';

/** Context an injector needs to deliver a message to a live session. */
export interface InjectTarget {
  readonly pid: number;
  readonly tty: string | null;
}

/**
 * Port: everything the core needs to support one agent kind. New agent =
 * new adapter; core stays untouched. Dependencies point inward (adapters
 * depend on this port, never the reverse).
 */
export interface AgentAdapter {
  readonly kind: AgentKind;
  /** process command substrings used to recognize this agent in `ps` output */
  readonly processNames: readonly string[];
  /** strategies tried in order until one succeeds */
  readonly injectStrategies: readonly InjectStrategyKind[];

  /** Locate the active transcript for a session running at `cwd`. */
  locateTranscript(cwd: string): Promise<string | null>;

  /** All candidate transcripts for `cwd`, newest first (concurrent sessions). */
  listTranscripts(cwd: string): Promise<readonly string[]>;

  /** Stable session id derived from the transcript path (uuid / rollout id). */
  sessionId(transcriptPath: string | null, pid: number): string;

  /** Parse one raw JSONL line; return null to ignore (noise, partial, meta). */
  parseLine(raw: string): TranscriptEvent | null;

  /** Extract a session title/summary from a raw line, if it carries one. */
  extractTitle(raw: string): string | null;

  /** Shape the outgoing body for this agent (e.g. append absolute file paths). */
  formatForInject(body: string, attachmentAbsPaths: readonly string[]): string;
}

/** A session discovered from transcript files alone (no owning tty process —
 *  e.g. Codex desktop / IDE sessions that still write rollout transcripts). */
export interface TranscriptSession {
  readonly sessionId: string;
  readonly cwd: string;
  readonly transcriptPath: string;
  readonly title: string | null;
  readonly lastActivityAt: number;
}

/** Optional adapter capability: discover sessions from transcripts, not `ps`. */
export interface TranscriptDiscoverable {
  discoverFromTranscripts(now: number): Promise<readonly TranscriptSession[]>;
}

export function isTranscriptDiscoverable(
  adapter: AgentAdapter,
): adapter is AgentAdapter & TranscriptDiscoverable {
  return typeof (adapter as Partial<TranscriptDiscoverable>).discoverFromTranscripts === 'function';
}

/** Port: deliver text to a running session via a concrete OS mechanism. */
export interface Injector {
  readonly kind: InjectStrategyKind;
  inject(target: InjectTarget, payload: string): Promise<InjectResult>;
}
