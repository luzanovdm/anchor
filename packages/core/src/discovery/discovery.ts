import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { AgentKind } from '../contract.js';
import { isTranscriptDiscoverable, type AgentAdapter } from '../ports.js';
import { listProcesses, processCwd, ttyDevice, type ProcSnapshot } from './proc.js';

/** Raw discovered session before turn-state / queue data is merged in. */
export interface DiscoveredSession {
  readonly key: string;
  readonly agent: AgentKind;
  readonly pid: number;
  readonly cpu: number;
  readonly tty: string;
  readonly cwd: string;
  readonly branch: string | null;
  readonly transcriptPath: string | null;
  readonly sessionId: string;
}

/**
 * Polls the OS for live agent processes and resolves each to a session.
 * Stateless per scan — the registry diffs scans over time.
 */
export class Discovery {
  /** Per-pid cwd/branch cache: a process's cwd never changes, and `lsof` is
   *  flaky, so caching keeps sessions stable instead of flickering in and out. */
  private readonly cwdCache = new Map<number, { cwd: string; branch: string | null }>();
  /** Sticky pid → transcript pairing so a session keeps its transcript. */
  private readonly transcriptCache = new Map<number, string>();

  constructor(private readonly adapters: readonly AgentAdapter[]) {}

  async scan(): Promise<DiscoveredSession[]> {
    const procs = await listProcesses();

    // processes that look like an interactive agent session
    const candidates = procs.filter((proc) => {
      const adapter = this.adapters.find((a) => matchesProcess(a, proc.comm));
      return adapter !== undefined && ttyDevice(proc.tty) !== null;
    });

    // forget cache entries for pids that are gone
    const livePids = new Set(candidates.map((p) => p.pid));
    for (const pid of [...this.cwdCache.keys()]) {
      if (!livePids.has(pid)) this.cwdCache.delete(pid);
    }
    for (const pid of [...this.transcriptCache.keys()]) {
      if (!livePids.has(pid)) this.transcriptCache.delete(pid);
    }

    // resolve each candidate's cwd (cached) and adapter
    const located = await Promise.all(
      candidates.map(async (proc) => {
        const adapter = this.adapters.find((a) => matchesProcess(a, proc.comm));
        if (adapter === undefined) return null;
        let info = this.cwdCache.get(proc.pid);
        if (info === undefined) {
          const cwd = await processCwd(proc.pid);
          // `/` is the lsof fallback for unresolved processes — not a session
          if (cwd === null || cwd === '/') return null;
          info = { cwd, branch: await gitBranch(cwd) };
          this.cwdCache.set(proc.pid, info);
        }
        return { proc, adapter, cwd: info.cwd, branch: info.branch };
      }),
    );
    const valid = located.filter(
      (l): l is { proc: ProcSnapshot; adapter: AgentAdapter; cwd: string; branch: string | null } =>
        l !== null,
    );

    // group concurrent sessions sharing one cwd so each gets its own transcript
    const groups = new Map<string, typeof valid>();
    for (const item of valid) {
      const groupKey = `${item.adapter.kind}::${item.cwd}`;
      const bucket = groups.get(groupKey) ?? [];
      bucket.push(item);
      groups.set(groupKey, bucket);
    }

    const sessions: DiscoveredSession[] = [];
    for (const bucket of groups.values()) {
      const first = bucket[0];
      if (first === undefined) continue;
      const { adapter, cwd, branch } = first;
      const transcripts = await adapter.listTranscripts(cwd);
      // keep prior pid→transcript pairings that are still valid; consume them
      const pool = [...transcripts];
      for (const { proc } of bucket) {
        const prev = this.transcriptCache.get(proc.pid);
        if (prev !== undefined && pool.includes(prev)) {
          pool.splice(pool.indexOf(prev), 1);
        } else {
          this.transcriptCache.delete(proc.pid);
        }
      }
      // assign remaining transcripts to unpaired pids, busiest ↔ freshest
      const unpaired = bucket
        .filter(({ proc }) => !this.transcriptCache.has(proc.pid))
        .sort((a, b) => b.proc.cpu - a.proc.cpu);
      unpaired.forEach(({ proc }, index) => {
        const t = pool[index] ?? pool[0];
        if (t !== undefined) this.transcriptCache.set(proc.pid, t);
      });

      for (const { proc } of bucket) {
        const transcriptPath = this.transcriptCache.get(proc.pid) ?? transcripts[0] ?? null;
        sessions.push({
          // one process = one session; pid is the stable identity
          key: `${adapter.kind}:${proc.pid}`,
          agent: adapter.kind,
          pid: proc.pid,
          cpu: proc.cpu,
          tty: proc.tty,
          cwd,
          branch,
          transcriptPath,
          sessionId: adapter.sessionId(transcriptPath, proc.pid),
        });
      }
    }
    // process-less sessions (e.g. Codex desktop/IDE) discovered from transcripts
    const usedTranscripts = new Set(
      sessions.map((s) => s.transcriptPath).filter((p): p is string => p !== null),
    );
    const now = Date.now();
    for (const adapter of this.adapters) {
      if (!isTranscriptDiscoverable(adapter)) continue;
      const found = await adapter.discoverFromTranscripts(now);
      for (const ts of found) {
        if (usedTranscripts.has(ts.transcriptPath)) continue;
        usedTranscripts.add(ts.transcriptPath);
        sessions.push({
          key: `${adapter.kind}:${ts.sessionId}`,
          agent: adapter.kind,
          pid: 0, // no controlling process
          cpu: 0,
          tty: '',
          cwd: ts.cwd,
          branch: await gitBranch(ts.cwd),
          transcriptPath: ts.transcriptPath,
          sessionId: ts.sessionId,
        });
      }
    }

    // stable display order independent of CPU jitter
    return sessions.sort(
      (a, b) =>
        a.agent.localeCompare(b.agent) || a.pid - b.pid || a.sessionId.localeCompare(b.sessionId),
    );
  }
}

/** Read the current branch from `<cwd>/.git/HEAD` without spawning git. */
async function gitBranch(cwd: string): Promise<string | null> {
  try {
    const head = await fs.readFile(join(cwd, '.git', 'HEAD'), 'utf8');
    const match = head.match(/ref:\s*refs\/heads\/(.+)\s*$/);
    if (match?.[1] !== undefined) return match[1].trim();
    return head.trim().slice(0, 7); // detached HEAD → short sha
  } catch {
    return null;
  }
}

function matchesProcess(adapter: AgentAdapter, comm: string): boolean {
  const lower = comm.toLowerCase();
  return adapter.processNames.some((name) => {
    const base = lower.split('/').pop() ?? lower;
    // match the executable basename to avoid catching unrelated paths
    return base === name || base.startsWith(`${name} `) || base === `${name}`;
  });
}

