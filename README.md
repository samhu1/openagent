# OAgent

<p align="center">
  <strong>An open-source, local-model-first desktop app for agentic coding workflows.</strong>
</p>

<p align="center">
  <a href="https://github.com/samhu1/openagent/blob/master/LICENSE">MIT License</a>
  ·
  <a href="https://github.com/samhu1/openagent/blob/master/CONTRIBUTING.md">Contributing</a>
  ·
  <a href="https://github.com/samhu1/openagent/blob/master/SECURITY.md">Security</a>
</p>

---

## What Is OAgent?

OAgent is an open-source Electron desktop app built for local-first, agentic software engineering workflows.

It is designed for developers who want a coding agent environment that runs locally, stays extensible, and remains transparent. OAgent combines:

- Multi-session chat and workspace context
- Native local tooling (Git, files, terminal, browser, MCP)
- Local-model support via Ollama plus provider flexibility (OpenRouter and protocol-based runtimes)
- Local-first project/session persistence

OAgent is intended to be a practical open-source base for a local model AI agentic coding app, while still supporting cloud/model-provider workflows when needed.

## Why OAgent

- **One place for agent + tools**: code conversations, tool calls, and project context in a unified interface.
- **Desktop-native behavior**: filesystem, terminal, and Git integrations without browser sandbox limitations.
- **Session continuity**: persistent projects/sessions with recovery and restore flows.
- **Protocol-aware runtime**: support for both the Agent SDK runtime and OAP/ACP-style runtime flows in the app.
- **Extensible by design**: MCP server management and custom tool rendering patterns.

## Core Capabilities

- Multiple concurrent agent sessions
- Background task/agent activity streams
- Tool call rendering with structured outputs
- Files panel with quick open-in-editor actions
- Git panel with status, staging, commit, and branch operations
- Terminal panel with PTY-backed sessions
- Browser panel for web-assisted coding tasks
- MCP controls and status inspection
- Compact mode and permission-mode workflows for safe automation

## Architecture Snapshot

OAgent is split into Electron main/preload + React renderer:

- **Electron main** (`/electron/src/main.ts`)
  - Window lifecycle
  - IPC handler registration
  - Native integrations (terminal, files, Git, MCP)
- **Electron preload** (`/electron/src/preload.ts`)
  - Typed bridge via `window.clientCore`
- **Renderer app** (`/src`)
  - Feature-sliced UI modules (`chat`, `tools`, `workspace`)
  - Runtime hooks for streaming/session state
  - Domain/core abstractions for settings and orchestration

Runtime support currently includes:

- **Anthropic Agent SDK path** (`@anthropic-ai/claude-agent-sdk`) for agent session flows
- **OAP runtime path** (`@agentclientprotocol/sdk`) for protocol-native sessions

See:

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/development.md`](docs/development.md)

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 10+
- macOS / Windows / Linux

### Install

```bash
git clone https://github.com/samhu1/openagent.git
cd openagent
pnpm install
```

### Run (dev)

```bash
pnpm dev
```

This starts:

- Vite renderer dev server
- Electron main/preload build watch
- Electron app window

### Build

```bash
pnpm build
```

### Package distributables

```bash
pnpm dist
```

Platform-specific packaging:

```bash
pnpm dist:mac
pnpm dist:win
pnpm dist:linux
```

## Runtime Setup

### OpenRouter

Set your OpenRouter key in app settings (`OpenRouter Key`) and choose a model.

### Ollama (optional local inference)

Install Ollama and pull at least one model:

```bash
ollama pull llama3.2
```

Then configure the Ollama endpoint/model in OAgent settings.

## Developer Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Start renderer + Electron in development mode |
| `pnpm build:electron` | Build Electron main/preload bundle |
| `pnpm build` | Production build for Electron + renderer |
| `pnpm start` | Launch packaged app entry locally |
| `pnpm dist` | Build distributables via electron-builder |
| `./scripts/oss-check.sh` | Typecheck, build, audit, and basic secret scan |

## Repository Structure

```text
electron/         # Main process, preload, IPC handlers, native integration glue
src/              # React renderer app
docs/             # Architecture, development, release process notes
build/            # Packaging assets (icons, entitlements)
scripts/          # Build/release helper scripts
```

## Contributing

Contributions are welcome. Before opening a PR:

1. Read [`CONTRIBUTING.md`](CONTRIBUTING.md)
2. Run:

```bash
pnpm exec tsc --noEmit
pnpm build
```

3. Include validation notes and screenshots for UI changes

## Security

Please report vulnerabilities privately per [`SECURITY.md`](SECURITY.md).  
Do not open public security issues.

## Support and Community

- [`SUPPORT.md`](SUPPORT.md) for support expectations
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) for community guidelines
- [`MAINTAINERS.md`](MAINTAINERS.md) for maintainer contacts

## License

MIT License. See [`LICENSE`](LICENSE).
