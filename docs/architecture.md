# Architecture

Open-source desktop client for the Agent Client Protocol. Uses the `@anthropic-ai/claude-agent-sdk` to programmatically manage Agent sessions via `query()`. Supports multiple concurrent sessions with persistent chat history, project workspaces, background agents, tool permissions, and context compaction.

## Tech Stack

- **Runtime**: Electron 40 (main process) + React 19 (renderer)
- **Build**: Vite 7, TypeScript 5.9, tsup (electron TS→JS)
- **Styling**: Tailwind CSS v4 + ShadCN UI (includes Preflight — no CSS resets needed)
- **UI Components**: ShadCN (Button, Badge, ScrollArea, Tooltip, Collapsible, Separator, DropdownMenu, Avatar)
- **Icons**: lucide-react
- **Markdown**: react-markdown + remark-gfm + react-syntax-highlighter + @tailwindcss/typography
- **Diff**: diff (word-level diff rendering)
- **Glass effect**: electron-liquid-glass (macOS Tahoe+ transparency)
- **SDK**: @anthropic-ai/claude-agent-sdk (ESM-only, async-imported from CommonJS)
- **Terminal**: node-pty (main process) + @xterm/xterm + @xterm/addon-fit (renderer)
- **Browser**: Electron `<webview>` tag (requires `webviewTag: true` in webPreferences)
- **Package manager**: pnpm
- **Path alias**: `@/` → `./src/`

## Project Structure

```text
electron/
├── tsconfig.json            # Electron-specific TS config (CJS output)
├── dist/                    # tsup build output (gitignored)
│   ├── main.js
│   └── preload.js
└── src/
    ├── main.ts              # App entry: createWindow, app lifecycle, devtools, registers all IPC
    ├── preload.ts           # contextBridge exposing window.agent API + glass detection
    ├── lib/
    │   ├── logger.ts        # log(), logStream setup
    │   ├── async-channel.ts # AsyncChannel class for multi-turn SDK input
    │   ├── data-dir.ts      # getDataDir, getProjectSessionsDir, getSessionFilePath
    │   ├── glass.ts         # Liquid glass detection + glassEnabled export
    │   ├── sdk.ts           # Cached getSDK() for @anthropic-ai/claude-agent-sdk
    │   └── git-exec.ts      # gitExec() helper + ALWAYS_SKIP set
    └── handlers/            # IPC handlers
        ├── oagent-sessions.handler.ts # oagent:start/send/stop/interrupt/permission_response
        ├── title-gen.handler.ts       # oagent:generate-title, git:generate-commit-message
        ├── projects.handler.ts        # projects:list/create/delete/rename
        ├── sessions.handler.ts        # sessions:save/load/list/delete/search
        ├── spaces.handler.ts          # spaces:list/save
        ├── files.handler.ts           # files:list/read-multiple, file:read/open-in-editor
        ├── terminal.handler.ts        # terminal:create/write/resize/destroy
        ├── git.handler.ts             # git:status/stage/unstage/commit/branches/checkout
        └── legacy-import.handler.ts   # legacy-sessions:list/import (transcripts)

src/
├── main.tsx         # React entry point
├── App.tsx          # Root: glass detection, TooltipProvider + AppLayout
├── index.css        # Tailwind v4 + ShadCN theme (light/dark, glass morphism)
│
├── components/
│   └── ui/          # ShadCN base components (auto-generated)
│
├── core/            # Runtime and workspace orchestration
│   ├── agents/      # Multi-agent coordination and background polling
│   ├── runtime/     # Streaming buffers, protocol parsing, eventing
│   └── workspace/   # Active project orchestration
│
├── domains/         # Domain models and exports
│   ├── project/     # Project metadata operations
│   ├── session/     # Session state data and abstractions
│   ├── settings/    # User settings and permissions
│   ├── space/       # Windowing and workspace panes
│   └── tools/       # Tool definitions and MCP metadata
│
├── features/        # UI Feature slices
│   ├── chat/        # Messages, tool calls, ChatView, inputs
│   ├── common/      # Shared components (Sidebar, Loaders)
│   ├── settings/    # Configuration menus
│   ├── tools/       # Resizable tool panels (Browser, Terminal, Files)
│   └── workspace/   # App layout, Empty states, Welcome Screens
│
├── hooks/           # Shared general hooks
├── lib/             # Shared utilities (class names, markdown parser bindings)
└── types/           # Type definitions (protocol, ui, window.d.ts)
```

## How to Run

```bash
pnpm install
pnpm dev       # Starts Vite dev server + tsup watch + Electron
pnpm build     # tsup (electron/) + Vite (renderer) production build
pnpm start     # Run Electron with pre-built dist/
```

## Architecture

### SDK-Based Session Management

The main process uses `@anthropic-ai/claude-agent-sdk` (ESM-only, loaded via `await import()`). Each session runs a long-lived SDK `query()` with an `AsyncChannel` for multi-turn input.

**Session Map**: `Map<sessionId, { channel, queryHandle, eventCounter, pendingPermissions }>`

- `channel` — AsyncChannel (push-based async iterable) for sending user messages to SDK
- `queryHandle` — SDK query handle for interrupt/close/setPermissionMode
- `pendingPermissions` — Map<requestId, { resolve }> for bridging SDK permission callbacks to UI

**IPC API — Agent Sessions:**

- `oagent:start(options)` → spawns SDK query with AsyncChannel, returns `{ sessionId, pid }`
  - Options: `cwd`, `model`, `permissionMode`, `resume` (session continuation)
  - Configures `canUseTool` callback for permission bridging
  - Thinking: `{ type: "enabled", budgetTokens: 16000 }`
- `oagent:send({ sessionId, message })` → pushes user message to session's AsyncChannel
- `oagent:stop(sessionId)` → closes channel + query handle, removes from Map
- `oagent:interrupt(sessionId)` → denies all pending permissions, calls `queryHandle.interrupt()`
- `oagent:permission_response(sessionId, requestId, ...)` → resolves pending permission Promise
- `agent:set-permission-mode(sessionId, mode)` → calls `queryHandle.setPermissionMode()`
- `oagent:generate-title(message, cwd?)` → one-shot Haiku query for chat title
- Events sent to renderer via `oagent:event` tagged with `_sessionId`
- Permission requests sent via `oagent:permission_request` with requestId

**IPC API — Projects:**

- `projects:list` / `projects:create` / `projects:delete` / `projects:rename`

**IPC API — Session Persistence:**

- `sessions:save(data)` — writes to `{userData}/oagent-data/sessions/{projectId}/{id}.json`
- `sessions:load(projectId, id)` — reads session file
- `sessions:list(projectId)` — returns session metadata sorted by date
- `sessions:delete(projectId, id)` — removes session file

**IPC API — Agent Code Import:**

- `legacy-sessions:list(projectPath)` — lists JSONL files in `~/.claude/projects/{hash}`
- `legacy-sessions:import(projectPath, legacySessionId)` — converts JSONL transcript to UIMessage[]

**IPC API — File Operations:**

- `files:list(cwd)` — git ls-files respecting .gitignore, returns `{ files, dirs }`
- `files:read-multiple(cwd, paths)` — batch read with path validation and size limits
- `file:read(filePath)` — single file read (used for diff context)
- `file:open-in-editor({ filePath, line? })` — opens file in external editor (tries cursor, code, zed CLIs with `--goto`, falls back to OS default)

**IPC API — Terminal (PTY):**

- `terminal:create({ cwd, cols, rows })` → spawns shell via node-pty, returns `{ terminalId }`
- `terminal:write({ terminalId, data })` → sends keystrokes to PTY
- `terminal:resize({ terminalId, cols, rows })` → resizes PTY dimensions
- `terminal:destroy(terminalId)` → kills the PTY process
- Events: `terminal:data` (PTY output), `terminal:exit` (process exit)

### State Architecture

- Top-level orchestrators manage the session list, active project routing, and workspace pane states.
- Domain feature slices handle specific subagent routing and stream buffering within active tasks.
- Background agents update local state arrays by polling async output files.

**BackgroundSessionStore** — accumulates events for non-active sessions to prevent state loss when switching. On switch-away, session state is captured into the store; on switch-back, state is consumed from the store (or loaded from disk if no live process).

### Agent CLI Stream-JSON Protocol

Key event types in order:

- `system` (init) — session metadata, model, tools, permissionMode, version
- `system` (status) — status updates
- `system` (compact_boundary) — context compaction marker
- `stream_event` wrapping: `message_start` → `content_block_start` → `content_block_delta` (repeated) → `content_block_stop` → `message_delta` → `message_stop`
- `assistant` — complete message snapshot (with `includePartialMessages`, sent after thinking and after text)
- `user` (tool_result) — tool execution results with `tool_use_result` metadata
- `result` — turn complete with cost/duration/modelUsage

### Key Patterns

**rAF streaming flush**: React 19 batches rapid `setState` calls into a single render. When SDK events arrive in a tight loop, all IPC-fired `setState` calls merge into one render → text appears all at once. Fix: accumulate deltas in `StreamingBuffer` (refs), schedule a single `requestAnimationFrame` to flush to React state at ~60fps.

**Subagent routing via `parent_tool_use_id`**: Events from Task subagents have `parent_tool_use_id` set to the Task tool_use block's `id`. A `parentToolMap` (Map<string, string>) maps this ID to the tool_call message ID in the UI, allowing subagent activity to be routed to the correct Task card with `subagentSteps`.

**Thinking with `includePartialMessages`**: Two `assistant` events per turn — first contains only thinking blocks, second contains only text blocks. The hook merges both into the same streaming message.

**Permission bridging**: SDK's async `canUseTool` callback creates a Promise stored in `pendingPermissions` Map. Main process sends `oagent:permission_request` to renderer. UI shows `PermissionPrompt`. User decision sent back via `oagent:permission_response`, resolving the stored Promise to allow/deny the tool.

**Background session store**: When switching sessions, the active session's state (messages, processing flag, sessionInfo, cost) is captured into `BackgroundSessionStore`. Events for non-active sessions route to the store instead of React state. On switch-back, state is consumed from the store to restore the UI instantly.

**Glass morphism**: On macOS Tahoe+, uses `electron-liquid-glass` for native transparency. DevTools opened via remote debugging on a separate window to avoid Electron bug #42846 (transparent + frameless + DevTools = broken clicks).

### Tools Panel System

The right side of the layout has a **ToolPicker** strip (vertical icon bar, always visible) that toggles tool panels on/off. Active tools state (`Set<ToolId>`) is persisted to localStorage.

**Layout**: `Sidebar | Chat | Tasks/Agents | [Tool Panels] | ToolPicker`

Tool panels share a resizable column. When multiple tools are active, they split vertically with a draggable divider (ratio persisted to localStorage, clamped 20%–80%). The column width is also resizable (280–800px).

**Terminal**: Multi-tab xterm.js instances. Each tab spawns a node-pty process in the main process via IPC. Uses `allowTransparency: true` + `background: "#00000000"` for transparent canvas that inherits the island's `bg-background`. The FitAddon + ResizeObserver auto-sizes the terminal on panel resize.

**Browser**: Multi-tab Electron `<webview>` with URL bar, back/forward/reload, HTTPS indicator. Smart URL input: bare domains get `https://` prefix, non-URL text becomes a Google search.

**Open Files**: Derives accessed files from the session's chat history — no IPC needed. Scans `tool_call` messages for edit tools + subagent steps. Tracks per-file access type (read/modified/created), deduplicates by path, sorts by most recently accessed.

### MCP Tool Rendering System

MCP tool calls are rendered with rich, tool-specific UIs. The system supports both SDK sessions (`mcp__Server__tool`) and OAP sessions (`Tool: Server/tool`).

**Registry**: Two-tier lookup:

1. **Exact match map** — keyed by canonical tool suffix
2. **Pattern match array** — using `[/_]+` character class to match both `__` (SDK) and `/` (OAP) separators

**Coding Conventions**:

- **Tailwind v4** — no CSS resets, Preflight handles normalization
- **ShadCN UI** — use `@/components/ui/*` for base components
- **Path aliases** — always use `@/` imports in src/ files
- **Logical margins** — use `ms-*`/`me-*` instead of `ml-*`/`mr-*`

## Reference Documentation

- **Agent SDK (Anthropic engine)**: `docs/ai-sdk/` — covers `query()`, MCP config, permissions, streaming, session management, subagents, etc.
- **OAP TypeScript SDK**: `docs/typescript-sdk-main/` — the `@agentclientprotocol/sdk` package, OAP client/server types, transport
- **Agent Client Protocol spec**: `docs/agent-client-protocol-main/` — OAP protocol spec, schema definitions, event types
