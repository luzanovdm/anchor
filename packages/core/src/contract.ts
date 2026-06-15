/**
 * IPC contract — the single typed boundary between the Electron main process
 * and the Angular renderer. Pure types only: no runtime, no Node imports.
 * Importable type-only from the renderer (the analog of `@tetri/contract`).
 */

export type AgentKind = 'claude' | 'codex';

/** Stable identity of a live agent session: `${agent}:${cwd}:${sessionId}`. */
export type SessionKey = string;

/** Whether the session is waiting for input or actively producing a turn. */
export type TurnState = 'idle' | 'working' | 'unknown';

/** Lifecycle of a session as seen by discovery. */
export type SessionLiveness = 'live' | 'dead';

export interface SessionInfo {
  readonly key: SessionKey;
  readonly agent: AgentKind;
  readonly cwd: string;
  /** git branch of `cwd`, when it is a repo */
  readonly branch: string | null;
  readonly pid: number;
  readonly tty: string | null;
  readonly transcriptPath: string | null;
  readonly turnState: TurnState;
  readonly liveness: SessionLiveness;
  /** epoch ms of the last observed transcript activity */
  readonly lastActivityAt: number;
  /** how the dispatcher will gate sends for this session */
  readonly gate: GateMode;
  /** number of queued messages waiting for this session */
  readonly queued: number;
}

/** `auto` = transcript-driven gate; `manual` = user presses "Send next". */
export type GateMode = 'auto' | 'manual';

/** One message in a session's transcript (for the inspector view). */
export interface TranscriptMessage {
  readonly role: 'user' | 'assistant' | 'tool';
  readonly text: string;
  readonly ts: number;
}

/** Watcher-derived live view of a session's content. */
export interface SessionLiveView {
  readonly key: SessionKey;
  /** session title/summary, when the agent provides one */
  readonly title: string | null;
  readonly turnState: TurnState;
  /** the agent's most recent assistant text — "what's in the session now" */
  readonly lastOutput: string | null;
  /** recent conversation, oldest → newest */
  readonly history: readonly TranscriptMessage[];
}

/** Full inspector payload: live view + the messages Anchor has dispatched. */
export interface SessionInspect extends SessionLiveView {
  readonly sent: readonly QueueEntry[];
}

export interface DraftMeta {
  readonly id: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly skillIds: readonly string[];
}

export interface DraftAttachment {
  /** path relative to the draft dir, e.g. `attachments/ab12cd34ef56.png` */
  readonly relPath: string;
  readonly originalName: string;
  readonly mime: string;
  readonly bytes: number;
  readonly isImage: boolean;
}

export interface Draft {
  readonly meta: DraftMeta;
  /** source of truth — mirror of `message.md` on disk */
  readonly body: string;
  readonly attachments: readonly DraftAttachment[];
}

export interface Skill {
  readonly id: string;
  readonly label: string;
  readonly target: AgentKind | 'any';
  /** output wrapper; `{{body}}` is replaced with the message body */
  readonly template: string;
}

export type QueueEntryStatus = 'queued' | 'sent' | 'failed';

export interface QueueEntry {
  readonly id: string;
  readonly draftId: string;
  readonly body: string;
  readonly attachments: readonly string[];
  readonly enqueuedAt: number;
  readonly status: QueueEntryStatus;
  readonly error?: string;
}

/** Result of attempting an injection into a session. */
export interface InjectResult {
  readonly ok: boolean;
  readonly strategy: 'tty' | 'clipboard';
  /** true when the message was only staged on the clipboard for the user to
   *  paste manually (GUI sessions we can't reliably drive). */
  readonly manual?: boolean;
  readonly error?: string;
}

/* ------------------------------------------------------------------ *
 * Renderer → main: the typed surface exposed on `window.anchor`.
 * Every method is async (IPC round-trip). Keep names stable.
 * ------------------------------------------------------------------ */

export interface AnchorBridge {
  readonly draft: {
    list(): Promise<readonly DraftMeta[]>;
    create(): Promise<Draft>;
    load(id: string): Promise<Draft | null>;
    /** durable autosave entry point — atomic tmp→rename on the main side */
    save(id: string, body: string): Promise<DraftMeta>;
    setSkills(id: string, skillIds: readonly string[]): Promise<DraftMeta>;
    /** assemble rendered.md (skills applied) and return its text */
    build(id: string): Promise<string>;
    remove(id: string): Promise<void>;
  };
  readonly file: {
    /** copy a dropped file into the draft, return its relative path */
    import(draftId: string, srcPath: string): Promise<DraftAttachment>;
  };
  readonly skills: {
    list(): Promise<readonly Skill[]>;
  };
  readonly sessions: {
    /** current registry snapshot */
    list(): Promise<readonly SessionInfo[]>;
    /** live updates; returns an unsubscribe function */
    subscribe(cb: (sessions: readonly SessionInfo[]) => void): () => void;
    /** title, current output, conversation history + dispatched messages */
    inspect(sessionKey: SessionKey): Promise<SessionInspect | null>;
  };
  readonly dispatch: {
    /** send a draft to a session: inject if idle+empty, else enqueue */
    send(sessionKey: SessionKey, draftId: string): Promise<void>;
    /** manual gate: force-send the head of the queue */
    sendNext(sessionKey: SessionKey): Promise<InjectResult | null>;
    /** steer: inject a draft immediately, mid-turn, bypassing the queue/gate */
    steer(sessionKey: SessionKey, draftId: string): Promise<InjectResult | null>;
    setGate(sessionKey: SessionKey, mode: GateMode): Promise<void>;
  };
  readonly queue: {
    list(sessionKey: SessionKey): Promise<readonly QueueEntry[]>;
    cancel(sessionKey: SessionKey, entryId: string): Promise<void>;
    /** edit a still-queued message's body before it is sent */
    edit(sessionKey: SessionKey, entryId: string, body: string): Promise<void>;
    reorder(sessionKey: SessionKey, entryId: string, toIndex: number): Promise<void>;
  };
}

/** IPC channel names — single source so main and preload never drift. */
export const IPC = {
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
  sessionsInspect: 'sessions:inspect',
  dispatchSend: 'dispatch:send',
  dispatchSendNext: 'dispatch:sendNext',
  dispatchSteer: 'dispatch:steer',
  dispatchSetGate: 'dispatch:setGate',
  queueList: 'queue:list',
  queueCancel: 'queue:cancel',
  queueEdit: 'queue:edit',
  queueReorder: 'queue:reorder',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
