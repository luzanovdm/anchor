import { contextBridge, ipcRenderer, webUtils } from 'electron';

// Note: this is a CommonJS preload (sandbox requirement) and cannot import the
// ESM `@anchor/core` types. The renderer re-types `window.anchor` as the
// `AnchorBridge` contract, so the shape is still enforced on the consuming side.

/**
 * Sandbox-safe preload (CommonJS). The ONLY bridge between renderer and Node.
 * Channel names are duplicated here as literals so this file needs no ESM
 * import of the core package at runtime; they must match `IPC` in the contract.
 */
const CH = {
  draftList: 'draft:list',
  draftCreate: 'draft:create',
  draftLoad: 'draft:load',
  draftSave: 'draft:save',
  draftSetSkills: 'draft:setSkills',
  draftBuild: 'draft:build',
  draftRemove: 'draft:remove',
  fileImport: 'file:import',
  skillsList: 'skills:list',
  sessionsList: 'sessions:list',
  sessionsChanged: 'sessions:changed',
  dispatchSend: 'dispatch:send',
  dispatchSendNext: 'dispatch:sendNext',
  dispatchSetGate: 'dispatch:setGate',
  queueList: 'queue:list',
  queueCancel: 'queue:cancel',
  queueReorder: 'queue:reorder',
} as const;

const bridge = {
  draft: {
    list: () => ipcRenderer.invoke(CH.draftList),
    create: () => ipcRenderer.invoke(CH.draftCreate),
    load: (id: string) => ipcRenderer.invoke(CH.draftLoad, id),
    save: (id: string, body: string) => ipcRenderer.invoke(CH.draftSave, id, body),
    setSkills: (id: string, skillIds: readonly string[]) =>
      ipcRenderer.invoke(CH.draftSetSkills, id, skillIds),
    build: (id: string) => ipcRenderer.invoke(CH.draftBuild, id),
    remove: (id: string) => ipcRenderer.invoke(CH.draftRemove, id),
  },
  file: {
    import: (draftId: string, srcPath: string) =>
      ipcRenderer.invoke(CH.fileImport, draftId, srcPath),
  },
  skills: {
    list: () => ipcRenderer.invoke(CH.skillsList),
  },
  sessions: {
    list: () => ipcRenderer.invoke(CH.sessionsList),
    subscribe: (cb: (sessions: unknown) => void) => {
      const listener = (_event: unknown, sessions: unknown): void => cb(sessions);
      ipcRenderer.on(CH.sessionsChanged, listener);
      return () => ipcRenderer.removeListener(CH.sessionsChanged, listener);
    },
  },
  dispatch: {
    send: (sessionKey: string, draftId: string) =>
      ipcRenderer.invoke(CH.dispatchSend, sessionKey, draftId),
    sendNext: (sessionKey: string) => ipcRenderer.invoke(CH.dispatchSendNext, sessionKey),
    setGate: (sessionKey: string, mode: string) =>
      ipcRenderer.invoke(CH.dispatchSetGate, sessionKey, mode),
  },
  queue: {
    list: (sessionKey: string) => ipcRenderer.invoke(CH.queueList, sessionKey),
    cancel: (sessionKey: string, entryId: string) =>
      ipcRenderer.invoke(CH.queueCancel, sessionKey, entryId),
    reorder: (sessionKey: string, entryId: string, toIndex: number) =>
      ipcRenderer.invoke(CH.queueReorder, sessionKey, entryId, toIndex),
  },
};

contextBridge.exposeInMainWorld('anchor', bridge);

// Native helpers that touch DOM types (kept out of the DOM-free core contract).
contextBridge.exposeInMainWorld('anchorNative', {
  // resolve the absolute path of a drag-dropped File (Electron webUtils)
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
});
