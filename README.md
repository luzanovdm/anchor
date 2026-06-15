# Anchor

**Durable composer & dispatcher for AI agent sessions — never lose a message.**

Anchor is a macOS desktop app (Electron + Angular 21) that does two things:

1. **Durable composer** — write your message (markdown, files, skills) into a
   buffer that lives on disk. A crash or power loss never costs you more than the
   last ~300 ms of typing. `message.md` is the source of truth; the UI is just a
   reflection of the file.
2. **Session dispatcher** — see every live Claude Code / Codex session, pick one,
   and send. If the agent is idle the message goes immediately; if it's busy it
   queues, and the next message is sent automatically the moment the agent's turn
   finishes — exactly one per turn, never interleaved into a tool-loop.

> Why "Anchor": your words stay on a tether — nothing drifts away.

## Status

MVP. macOS only. Agents: `claude`, `codex`.

## Architecture

Four services live in the Electron **main** process; the Angular **renderer**
talks to them only through a typed `contextBridge` preload (the analog of a
shared contract package):

```
Composer (durable md + files + skills)  ──┐
                                          ▼
Discovery ──► SessionRegistry ──► Dispatcher ──► InjectAdapter
   (ps/lsof)      (live state)     (queue+gate)    (TTY / paste)
                       ▲
              TranscriptWatcher (tail JSONL → turn state)
```

| Package | Role |
|---|---|
| `packages/core` | domain: durable stores, discovery, watcher, dispatcher, IPC contract |
| `packages/adapters` | per-agent adapters (`claude`, `codex`) + injectors (TTY, clipboard) |
| `packages/ui-kit` | generic primitives + design tokens **vendored from `@tetri/ui-kit`** |
| `apps/main` | Electron main process, typed IPC, preload bridge |
| `apps/renderer` | Angular 21 renderer (zoneless, signals) |

### Turn detection (the hard part)

A turn is considered finished only when **all three** signals agree: the last
transcript event is a final assistant message, the transcript hasn't grown for
`IDLE_MS`, and the process CPU is ≈ 0. Any growth resets the timer (a tool-loop
is still running). If detection proves noisy for an agent, the session falls back
to a **manual gate** — the queue and "Send next" button work regardless.

### Injection

Primary strategy writes a bracketed-paste sequence to the session's TTY. macOS
restricts injecting into another process's input, so the **clipboard fallback**
(pasteboard + focus the owning terminal + Cmd+V) is the reliable path and needs
Accessibility permission. Strategy order is per-adapter.

## Develop

```bash
npm install          # ELECTRON_SKIP_BINARY_DOWNLOAD=1 to skip the binary in CI
npm run dev          # build core + renderer, launch Electron
npm run lint
npm run typecheck
npm run build        # build everything
npm run dist         # package a macOS .dmg (electron-builder)
```

Data lives in `~/Library/Application Support/Anchor/`.

## Add an agent adapter

Implement `AgentAdapter` (`packages/core/src/ports.ts`) — transcript location,
JSONL line parsing, session id, inject formatting, strategy order — and register
it in `packages/adapters/src/index.ts` (`defaultAdapters`). The core never
changes; a new agent is purely a new adapter.

## License

MIT.
