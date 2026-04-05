#!/usr/bin/env bash
set -euo pipefail

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required" >&2
  exit 1
fi

echo "[1/6] Typecheck"
pnpm exec tsc --noEmit

echo "[2/6] Build"
pnpm build

echo "[3/6] Dependency audit (runtime deps)"
pnpm audit --audit-level moderate --prod || true

echo "[4/6] Secret heuristic scan"
SECRET_PATTERNS='(AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[A-Za-z0-9-]{10,80}|sk-[A-Za-z0-9]{20,}|-----BEGIN ([A-Z0-9 ]+ )?PRIVATE KEY-----)'
if rg -n --hidden \
  --glob '!node_modules/**' \
  --glob '!.git/**' \
  --glob '!dist/**' \
  --glob '!electron/dist/**' \
  --glob '!scripts/oss-check.sh' \
  "$SECRET_PATTERNS" .; then
  echo "Potential secret-like strings found. Review required." >&2
  exit 2
fi

echo "[5/6] Private path guard (tracked files)"
if git ls-files \
  | rg --no-line-number '(^|/)\.env($|\.[^/]+$)|(^|/)\.claude/|(^|/)logs/|(^|/)random-notes\.md$|(^|/)text$' \
  | rg -v '(^|/)\.env\.example$'; then
  echo "Tracked private files detected. Remove before open-sourcing." >&2
  exit 3
fi

echo "[6/6] Required open-source files"
for required in LICENSE README.md CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md SUPPORT.md; do
  if [[ ! -f "$required" ]]; then
    echo "Missing required file: $required" >&2
    exit 4
  fi
done

echo "Open-source readiness checks completed."
