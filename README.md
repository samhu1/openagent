# OAgent

OAgent is a desktop workspace for running coding agents, tools, and project context in one place.

## Features

- Multiple concurrent agent sessions
- OpenRouter, Ollama, and local workflow support
- Integrated terminal, git, files, browser, and MCP tooling
- Local persistence for sessions, projects, spaces, and settings

## Tech stack

- Electron + React + TypeScript
- Vite + tsup
- ACP/MCP integration

## Quick start

### Prerequisites

- Node.js 20+
- pnpm 10+

### Install and run

```bash
pnpm install
pnpm dev
```

### Optional local model setup

If you want to use local models through Ollama:

```bash
ollama pull llama3.2
```

### Build

```bash
pnpm build
pnpm dist
```

## Troubleshooting

- If dev startup fails after dependency updates, run `pnpm install --frozen-lockfile`.
- If Electron fails to load after a frontend refactor, rerun `pnpm build:electron`.

## Contributing

See `CONTRIBUTING.md` for development workflow and PR expectations.

## Security

See `SECURITY.md` for responsible disclosure.

## License

MIT - see `LICENSE`.
