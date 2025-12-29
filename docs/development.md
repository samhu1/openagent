# Development Guide

## Prerequisites

- Node.js 20+
- pnpm 10+

## Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm exec tsc --noEmit
```

## Open-source readiness checks

```bash
./scripts/oss-check.sh
```

## Typical workflow

1. Create a branch.
2. Implement focused changes.
3. Run build/typecheck.
4. Open a PR with test notes.
