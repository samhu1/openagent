# Architecture Overview

OAgent is an Electron desktop app with:

- Main process: IPC, session/runtime orchestration, filesystem/tool integrations.
- Preload bridge: safe API surface exposed to renderer (`window.oagent`).
- Renderer: React UI, workspace/session management, tool panels.

Core subsystems:

- Session runtime (model/provider orchestration)
- ACP/MCP integration layer
- Tooling panels (terminal, git, files, browser)
- Persistence (projects/sessions/settings)
