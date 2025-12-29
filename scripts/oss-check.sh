#!/usr/bin/env bash
set -euo pipefail

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required" >&2
  exit 1
fi

echo "[1/4] Typecheck"
pnpm exec tsc --noEmit

echo "[2/4] Build"
pnpm build

echo "[3/4] Dependency audit"
pnpm audit --audit-level moderate || true

echo "[4/4] Basic secret heuristic"
if rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' '(sk-or-v1|AKIA[0-9A-Z]{16}|BEGIN PRIVATE KEY)' .; then
  echo "Potential secret-like strings found. Review required." >&2
  exit 2
fi

echo "Open-source readiness checks completed."
