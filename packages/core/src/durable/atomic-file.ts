import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Crash-safe write: stream into a sibling `.tmp` then `rename` over the target.
 * `rename` is atomic on the same filesystem, so a power loss mid-write either
 * leaves the old file intact or the fully-written new one — never a partial.
 * This is the core durability guarantee of the composer.
 */
export async function atomicWrite(path: string, data: string | Uint8Array): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  // unique tmp name avoids two concurrent writers clobbering one tmp file
  const tmp = `${path}.${process.pid}.${randomSuffix()}.tmp`;
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(data);
    // flush to physical storage before the rename so the rename can't win the race
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, path);
}

export async function readText(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, 'utf8');
  } catch (err) {
    if (isEnoent(err)) return null;
    throw err;
  }
}

export async function readJson<T>(path: string): Promise<T | null> {
  const raw = await readText(path);
  if (raw === null) return null;
  return JSON.parse(raw) as T;
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await atomicWrite(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Content-addressed name: `sha1(content)[:12]` — used for de-duped attachments. */
export function contentHash(data: Uint8Array): string {
  return createHash('sha1').update(data).digest('hex').slice(0, 12);
}

/** Append a single JSONL record, creating the file if needed. */
export async function appendJsonl(path: string, record: unknown): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.appendFile(path, `${JSON.stringify(record)}\n`, 'utf8');
}

export async function readJsonl<T>(path: string): Promise<T[]> {
  const raw = await readText(path);
  if (raw === null) return [];
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

/** Rewrite a JSONL file atomically (used by queue cancel/reorder). */
export async function rewriteJsonl(path: string, records: readonly unknown[]): Promise<void> {
  const body = records.map((r) => JSON.stringify(r)).join('\n');
  await atomicWrite(path, records.length > 0 ? `${body}\n` : '');
}

function randomSuffix(): string {
  return createHash('sha1')
    .update(`${process.hrtime.bigint()}`)
    .digest('hex')
    .slice(0, 8);
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'ENOENT'
  );
}

/** Join used by stores; re-exported so callers avoid importing `node:path` directly. */
export { join as joinPath };
