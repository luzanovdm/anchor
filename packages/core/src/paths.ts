import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Data layout under `~/Library/Application Support/Anchor/`. The directory is
 * injectable so tests can point at a temp dir instead of the real one.
 */
export class AnchorPaths {
  constructor(public readonly root: string = defaultRoot()) {}

  get drafts(): string {
    return join(this.root, 'drafts');
  }
  get skills(): string {
    return join(this.root, 'skills');
  }
  get queue(): string {
    return join(this.root, 'queue');
  }
  get state(): string {
    return join(this.root, 'state');
  }

  draftDir(id: string): string {
    return join(this.drafts, id);
  }
  draftMessage(id: string): string {
    return join(this.draftDir(id), 'message.md');
  }
  draftRendered(id: string): string {
    return join(this.draftDir(id), 'rendered.md');
  }
  draftMeta(id: string): string {
    return join(this.draftDir(id), 'meta.json');
  }
  draftAttachments(id: string): string {
    return join(this.draftDir(id), 'attachments');
  }
  queueFile(sessionKey: string): string {
    // session-key contains `/` and `:` — encode to a flat filename
    const safe = sessionKey.replace(/[^a-zA-Z0-9._-]/g, '_');
    return join(this.queue, `${safe}.jsonl`);
  }
  sessionsSnapshot(): string {
    return join(this.state, 'sessions.json');
  }
}

function defaultRoot(): string {
  return join(homedir(), 'Library', 'Application Support', 'Anchor');
}
