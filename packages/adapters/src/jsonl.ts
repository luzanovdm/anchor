import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/** All `.jsonl` files under a directory, newest first. */
export async function listJsonlByMtime(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = (await fs.readdir(dir)).filter((n) => n.endsWith('.jsonl'));
  } catch {
    return [];
  }
  const stated = await Promise.all(
    entries.map(async (name) => {
      const path = join(dir, name);
      try {
        return { path, mtime: (await fs.stat(path)).mtimeMs };
      } catch {
        return null;
      }
    }),
  );
  return stated
    .filter((s): s is { path: string; mtime: number } => s !== null)
    .sort((a, b) => b.mtime - a.mtime)
    .map((s) => s.path);
}

/** Pick the most recently modified `.jsonl` under a directory (active transcript). */
export async function newestJsonl(dir: string): Promise<string | null> {
  return (await listJsonlByMtime(dir))[0] ?? null;
}

/** Recursively find all `rollout-*.jsonl` (Codex nests by date), newest first. */
export async function listRolloutsByMtime(root: string): Promise<string[]> {
  const files = await collectRollouts(root);
  const stated = await Promise.all(
    files.map(async (path) => {
      try {
        return { path, mtime: (await fs.stat(path)).mtimeMs };
      } catch {
        return null;
      }
    }),
  );
  return stated
    .filter((s): s is { path: string; mtime: number } => s !== null)
    .sort((a, b) => b.mtime - a.mtime)
    .map((s) => s.path);
}

/** Recursively find the newest `rollout-*.jsonl` (Codex nests by date). */
export async function newestRollout(root: string): Promise<string | null> {
  return (await listRolloutsByMtime(root))[0] ?? null;
}

async function collectRollouts(dir: string): Promise<string[]> {
  let dirents: import('node:fs').Dirent[];
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const dirent of dirents) {
    const full = join(dir, dirent.name);
    if (dirent.isDirectory()) {
      found.push(...(await collectRollouts(full)));
    } else if (dirent.name.startsWith('rollout-') && dirent.name.endsWith('.jsonl')) {
      found.push(full);
    }
  }
  return found;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return ms;
  }
  return fallback;
}
