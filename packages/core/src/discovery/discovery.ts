import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { AgentKind } from '../contract.js';
import type { AgentAdapter } from '../ports.js';
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
  constructor(private readonly adapters: readonly AgentAdapter[]) {}

  async scan(): Promise<DiscoveredSession[]> {
    const procs = await listProcesses();

    // resolve each matching, interactive process to its cwd
    const located = await Promise.all(
      procs.map(async (proc) => {
        const adapter = this.adapters.find((a) => matchesProcess(a, proc.comm));
        if (adapter === undefined) return null;
        // only real interactive sessions: must own a tty (drops daemons/helpers)
        if (ttyDevice(proc.tty) === null) return null;
        const cwd = await processCwd(proc.pid);
        // `/` is the lsof fallback for processes we can't resolve — not a session
        if (cwd === null || cwd === '/') return null;
        return { proc, adapter, cwd };
      }),
    );
    const valid = located.filter(
      (l): l is { proc: ProcSnapshot; adapter: AgentAdapter; cwd: string } => l !== null,
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
      const adapter = bucket[0]?.adapter;
      const cwd = bucket[0]?.cwd;
      if (adapter === undefined || cwd === undefined) continue;
      const transcripts = await adapter.listTranscripts(cwd);
      const branch = await gitBranch(cwd);
      // busiest process ↔ freshest transcript (best-effort pairing)
      const ordered = [...bucket].sort((a, b) => b.proc.cpu - a.proc.cpu);
      ordered.forEach(({ proc }, index) => {
        const transcriptPath = transcripts[index] ?? transcripts[0] ?? null;
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
      });
    }
    return sessions;
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

