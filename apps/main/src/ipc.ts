import { ipcMain, type WebContents } from 'electron';
import { IPC, type GateMode, type SessionKey } from '@anchor/core';
import type { Services } from './services.js';
import { logger } from './logger.js';

/**
 * Wire the typed IPC contract to the services. Renderer args arrive as
 * `unknown`; each handler narrows before use — the renderer is never trusted.
 */
export function registerIpc(services: Services): void {
  handle(IPC.draftList, () => services.listDrafts());
  handle(IPC.draftCreate, () => services.createDraft());
  handle(IPC.draftLoad, (id: unknown) => services.loadDraft(str(id)));
  handle(IPC.draftSave, (id: unknown, body: unknown) => services.saveDraft(str(id), str(body)));
  handle(IPC.draftSetSkills, (id: unknown, skillIds: unknown) =>
    services.setSkills(str(id), strArray(skillIds)),
  );
  handle(IPC.draftBuild, (id: unknown) => services.buildDraft(str(id)));
  handle(IPC.draftRemove, (id: unknown) => services.removeDraft(str(id)));

  handle(IPC.fileImport, (draftId: unknown, srcPath: unknown) =>
    services.importFile(str(draftId), str(srcPath)),
  );
  handle(IPC.skillsList, () => services.listSkills());

  handle(IPC.sessionsList, () => services.listSessions());
  handle(IPC.dispatchSend, (key: unknown, draftId: unknown) =>
    services.send(sessionKey(key), str(draftId)),
  );
  handle(IPC.dispatchSendNext, (key: unknown) => services.sendNext(sessionKey(key)));
  handle(IPC.dispatchSetGate, (key: unknown, mode: unknown) => {
    services.setGate(sessionKey(key), gateMode(mode));
  });

  handle(IPC.queueList, (key: unknown) => services.listQueue(sessionKey(key)));
  handle(IPC.queueCancel, (key: unknown, entryId: unknown) =>
    services.cancelQueue(sessionKey(key), str(entryId)),
  );
  handle(IPC.queueReorder, (key: unknown, entryId: unknown, toIndex: unknown) =>
    services.reorderQueue(sessionKey(key), str(entryId), int(toIndex)),
  );
}

/** Push live registry snapshots to a renderer's webContents. Returns disposer. */
export function pushSessions(services: Services, contents: WebContents): () => void {
  return services.onSessionsChanged((sessions) => {
    if (!contents.isDestroyed()) contents.send(IPC.sessionsChanged, sessions);
  });
}

function handle(
  channel: string,
  fn: (...args: unknown[]) => unknown | Promise<unknown>,
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      return await fn(...args);
    } catch (err) {
      logger.error('ipc', `${channel} failed`, { err: String(err) });
      throw err;
    }
  });
}

function str(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('expected string');
  return value;
}

function int(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new TypeError('expected integer');
  return value;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((v): v is string => typeof v === 'string')) {
    throw new TypeError('expected string[]');
  }
  return value;
}

function sessionKey(value: unknown): SessionKey {
  return str(value);
}

function gateMode(value: unknown): GateMode {
  if (value !== 'auto' && value !== 'manual') throw new TypeError('expected gate mode');
  return value;
}
