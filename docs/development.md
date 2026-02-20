# Development Guide

Welcome to the development guide for OAgent. Setting up your local environment and understanding our workflows will help you land solid contributions.

## Prerequisites

- Node.js 20 or later
- pnpm 10 or later
- Ensure your OS allows launching raw Electron process apps locally. On macOS, liquid glass (`electron-liquid-glass`) requires Tahoe+.

## Commands Reference

The following commands are available from the `package.json` for rapid iteration. We use `tsup` for compiling the backend Main process to CommonJS (`electron/dist`) and Vite for shipping the React Renderer process.

- `pnpm install`: Install workspace dependencies cleanly via lockfile.
- `pnpm dev`: Start the UI and the backend under concurrency, watching for changes.
- `pnpm build`: Generate production bundles for Electron and React.
- `pnpm exec tsc --noEmit`: Typecheck across the boundaries.

## Contribution Life Cycle

1. **Fork or Branch**: Create a feature branch like `fix/sidebar-bug` or `codex/new-tool`.
2. **Develop**: Try to keep component layers properly separated. Refer to [Architecture](architecture.md).
3. **Check Types**: Don't break `tsc` compliance in the process!
4. **Open a Pull Request**: Check `CONTRIBUTING.md` for our review targets.

## Verifying Open-Source Readiness

Always double check our open-source scripts prior to pushing up:

```bash
./scripts/oss-check.sh
```

## Running the Application

Under standard developer flows:

```bash
pnpm install
pnpm dev
```

Wait about 2-3 seconds for `.vite` to boot before Electron launches the frameless interface.
