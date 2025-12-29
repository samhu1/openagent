# Contributing to OAgent

Thanks for contributing.

## Development setup

1. Install Node.js 20+ and pnpm.
2. Install dependencies:

```bash
pnpm install
```

3. Start the app in development mode:

```bash
pnpm dev
```

## Build and checks

Before opening a PR, run:

```bash
pnpm build
pnpm exec tsc --noEmit
```

## Branch and commit conventions

- Use focused branches (for example: `codex/feature-name`, `fix/issue-123`).
- Keep commits small and atomic.
- Write clear commit messages explaining intent.

## Pull requests

- Include a concise summary, rationale, and testing notes.
- Link related issues.
- Add screenshots/GIFs for UI changes.
- Keep PR scope limited to one concern.

## Code style

- Preserve existing patterns and naming unless a refactor is intentional.
- Avoid unrelated formatting churn.
- Prefer explicit, readable code over clever shortcuts.

## Reporting bugs

Use the bug report template and include:

- OS and version
- Repro steps
- Expected vs actual behavior
- Logs and screenshots where possible
