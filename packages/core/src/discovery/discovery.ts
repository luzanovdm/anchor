import type { AgentKind } from '../contract.js';
import type { AgentAdapter } from '../ports.js';
import { listProcesses, processCwd, type ProcSnapshot } from './proc.js';

/** Raw discovered session before turn-state / queue data is merged in. */
export interface DiscoveredSession {
  readonly key: string;
  readonly agent: AgentKind;
  readonly pid: number;
  readonly cpu: number;
  readonly tty: string;
  readonly cwd: string;
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
    const matched: Array<{ proc: ProcSnapshot; adapter: AgentAdapter }> = [];
    for (const proc of procs) {
      const adapter = this.adapters.find((a) => matchesProcess(a, proc.comm));
      if (adapter !== undefined) matched.push({ proc, adapter });
    }

    const resolved = await Promise.all(
      matched.map(async ({ proc, adapter }) => {
        const cwd = await processCwd(proc.pid);
        if (cwd === null) return null;
        const transcriptPath = await adapter.locateTranscript(cwd);
        const sessionId = adapter.sessionId(transcriptPath, proc.pid);
        const session: DiscoveredSession = {
          key: `${adapter.kind}:${cwd}:${sessionId}`,
          agent: adapter.kind,
          pid: proc.pid,
          cpu: proc.cpu,
          tty: proc.tty,
          cwd,
          transcriptPath,
          sessionId,
        };
        return session;
      }),
    );

    return dedupeByKey(resolved.filter((s): s is DiscoveredSession => s !== null));
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

/** Out of scope: multiple sessions in one cwd — keep the highest-CPU one. */
function dedupeByKey(sessions: readonly DiscoveredSession[]): DiscoveredSession[] {
  const byCwd = new Map<string, DiscoveredSession>();
  for (const session of sessions) {
    const cwdKey = `${session.agent}:${session.cwd}`;
    const existing = byCwd.get(cwdKey);
    if (existing === undefined || session.cpu > existing.cpu) {
      byCwd.set(cwdKey, session);
    }
  }
  return [...byCwd.values()];
}
