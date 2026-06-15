import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export interface ProcSnapshot {
  readonly pid: number;
  readonly cpu: number;
  readonly stat: string;
  /** raw tty token from ps, e.g. `s002` or `??` when detached */
  readonly tty: string;
  /** command name / path as reported by ps */
  readonly comm: string;
}

/**
 * One `ps` call for all processes. macOS `ps` columns; we trim and parse by
 * fixed leading fields, keeping the rest as `comm` (which may contain spaces).
 */
export async function listProcesses(): Promise<ProcSnapshot[]> {
  const { stdout } = await exec('ps', ['-axo', 'pid=,pcpu=,stat=,tty=,comm='], {
    maxBuffer: 8 * 1024 * 1024,
  });
  const out: ProcSnapshot[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue;
    const [pidRaw, cpuRaw, stat, tty, ...rest] = parts;
    const pid = Number(pidRaw);
    const cpu = Number(cpuRaw);
    if (!Number.isFinite(pid) || stat === undefined || tty === undefined) continue;
    out.push({
      pid,
      cpu: Number.isFinite(cpu) ? cpu : 0,
      stat,
      tty,
      comm: rest.join(' '),
    });
  }
  return out;
}

/** Current working directory of a process via `lsof -d cwd`. */
export async function processCwd(pid: number): Promise<string | null> {
  try {
    const { stdout } = await exec('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
      maxBuffer: 1024 * 1024,
    });
    for (const line of stdout.split('\n')) {
      if (line.startsWith('n')) return line.slice(1);
    }
    return null;
  } catch {
    return null;
  }
}

/** Live CPU% for a single pid — used by the turn detector's "CPU ≈ 0" signal. */
export async function processCpu(pid: number): Promise<number | null> {
  try {
    const { stdout } = await exec('ps', ['-o', 'pcpu=', '-p', String(pid)], {
      maxBuffer: 64 * 1024,
    });
    const value = Number(stdout.trim());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Normalize a ps tty token to an absolute device path, or null if detached. */
export function ttyDevice(rawTty: string): string | null {
  if (rawTty === '??' || rawTty === '?' || rawTty === '-' || rawTty.length === 0) return null;
  return rawTty.startsWith('tty') ? `/dev/${rawTty}` : `/dev/tty${rawTty}`;
}
