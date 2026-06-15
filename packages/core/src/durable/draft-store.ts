import { promises as fs } from 'node:fs';
import { extname, basename } from 'node:path';
import type { Draft, DraftAttachment, DraftMeta } from '../contract.js';
import type { AnchorPaths } from '../paths.js';
import {
  atomicWrite,
  contentHash,
  readJson,
  readText,
  writeJson,
} from './atomic-file.js';

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);

/**
 * Durable storage for composer drafts. `message.md` is the source of truth;
 * everything else (meta, rendered) is derived. All writes are atomic.
 */
export class DraftStore {
  constructor(private readonly paths: AnchorPaths) {}

  async list(): Promise<DraftMeta[]> {
    const ids = await this.listIds();
    const metas = await Promise.all(ids.map((id) => this.readMeta(id)));
    return metas
      .filter((m): m is DraftMeta => m !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async create(now: number): Promise<Draft> {
    const id = newId(now);
    const meta: DraftMeta = {
      id,
      title: 'Untitled',
      createdAt: now,
      updatedAt: now,
      skillIds: [],
    };
    await fs.mkdir(this.paths.draftAttachments(id), { recursive: true });
    await atomicWrite(this.paths.draftMessage(id), '');
    await writeJson(this.paths.draftMeta(id), meta);
    return { meta, body: '', attachments: [] };
  }

  async load(id: string): Promise<Draft | null> {
    const meta = await this.readMeta(id);
    if (meta === null) return null;
    const body = (await readText(this.paths.draftMessage(id))) ?? '';
    const attachments = await this.listAttachments(id);
    return { meta, body, attachments };
  }

  /** Autosave entry point. Writes the body atomically, then refreshes meta. */
  async save(id: string, body: string, now: number): Promise<DraftMeta> {
    await atomicWrite(this.paths.draftMessage(id), body);
    const prev = await this.readMeta(id);
    const meta: DraftMeta = {
      id,
      title: deriveTitle(body),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      skillIds: prev?.skillIds ?? [],
    };
    await writeJson(this.paths.draftMeta(id), meta);
    return meta;
  }

  async setSkills(id: string, skillIds: readonly string[], now: number): Promise<DraftMeta> {
    const prev = await this.readMeta(id);
    if (prev === null) throw new Error(`draft not found: ${id}`);
    const meta: DraftMeta = { ...prev, skillIds: [...skillIds], updatedAt: now };
    await writeJson(this.paths.draftMeta(id), meta);
    return meta;
  }

  async remove(id: string): Promise<void> {
    await fs.rm(this.paths.draftDir(id), { recursive: true, force: true });
  }

  /** Copy a dropped file into the draft, de-duping by content hash. */
  async importFile(draftId: string, srcPath: string): Promise<DraftAttachment> {
    const data = await fs.readFile(srcPath);
    const ext = extname(srcPath).toLowerCase();
    const hash = contentHash(data);
    const fileName = `${hash}${ext}`;
    const relPath = `attachments/${fileName}`;
    const destDir = this.paths.draftAttachments(draftId);
    await fs.mkdir(destDir, { recursive: true });
    const dest = `${destDir}/${fileName}`;
    if (!(await exists(dest))) {
      await fs.copyFile(srcPath, dest);
    }
    return {
      relPath,
      originalName: basename(srcPath),
      mime: mimeFor(ext),
      bytes: data.byteLength,
      isImage: IMAGE_EXT.has(ext),
    };
  }

  async writeRendered(id: string, rendered: string): Promise<void> {
    await atomicWrite(this.paths.draftRendered(id), rendered);
  }

  private async readMeta(id: string): Promise<DraftMeta | null> {
    return readJson<DraftMeta>(this.paths.draftMeta(id));
  }

  private async listIds(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.paths.drafts, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  private async listAttachments(id: string): Promise<DraftAttachment[]> {
    try {
      const names = await fs.readdir(this.paths.draftAttachments(id));
      return Promise.all(
        names.map(async (name) => {
          const ext = extname(name).toLowerCase();
          const stat = await fs.stat(`${this.paths.draftAttachments(id)}/${name}`);
          return {
            relPath: `attachments/${name}`,
            originalName: name,
            mime: mimeFor(ext),
            bytes: stat.size,
            isImage: IMAGE_EXT.has(ext),
          } satisfies DraftAttachment;
        }),
      );
    } catch {
      return [];
    }
  }
}

function deriveTitle(body: string): string {
  const firstLine = body.split('\n').find((line) => line.trim().length > 0);
  if (firstLine === undefined) return 'Untitled';
  return firstLine.replace(/^#+\s*/, '').trim().slice(0, 80) || 'Untitled';
}

function newId(now: number): string {
  return `${now.toString(36)}-${Math.trunc(now % 1000).toString(36).padStart(2, '0')}`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

function mimeFor(ext: string): string {
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.pdf':
      return 'application/pdf';
    case '.md':
      return 'text/markdown';
    case '.txt':
      return 'text/plain';
    default:
      return 'application/octet-stream';
  }
}
