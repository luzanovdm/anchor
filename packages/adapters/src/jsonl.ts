import { promises as fs } from 'node:fs';
import { join } from 'node:path';

/** Pick the most recently modified `.jsonl` under a directory (active transcript). */
export async function newestJsonl(dir: string): Promise<string | null> {
  let entries: string[];
  try {
    entries = (await fs.readdir(dir)).filter((n) => n.endsWith('.jsonl'));
  } catch {
    return null;
  }
  let best: { path: string; mtime: number } | null = null;
  for (const name of entries) {
    const path = join(dir, name);
    try {
      const stat = await fs.stat(path);
      const mtime = stat.mtimeMs;
      if (best === null || mtime > best.mtime) best = { path, mtime };
    } catch {
      // ignore unreadable file
    }
  }
  return best?.path ?? null;
}

/** Recursively find the newest `rollout-*.jsonl` (Codex nests by date). */
export async function newestRollout(root: string): Promise<string | null> {
  const files = await collectRollouts(root);
  let best: { path: string; mtime: number } | null = null;
  for (const path of files) {
    try {
      const stat = await fs.stat(path);
      if (best === null || stat.mtimeMs > best.mtime) best = { path, mtime: stat.mtimeMs };
    } catch {
      // ignore unreadable file
    }
  }
  return best?.path ?? null;
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
