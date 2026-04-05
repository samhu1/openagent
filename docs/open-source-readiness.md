# Open-Source Readiness

Use this checklist before making the repository public or cutting a public release.

## 1. Run local readiness checks

```bash
./scripts/oss-check.sh
```

This validates:

- Typecheck and production build
- Runtime dependency audit (`pnpm audit --prod`, moderate+ findings are surfaced for review)
- Heuristic secret scan for common credential formats
- Tracked private-path guard (`.env*`, `.claude/`, `logs/`, private notes)
- Required community/legal files (`LICENSE`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `SUPPORT.md`)

## 2. Confirm GitHub community setup

- Issue forms are enabled in `.github/ISSUE_TEMPLATE/`
- PR template is present at `.github/pull_request_template.md`
- Security workflow runs from `.github/workflows/security.yml`
- Public branch guard runs from `.github/workflows/public-guard.yml`

## 3. Confirm legal and policy docs

- `LICENSE` matches the intended open-source license
- `SECURITY.md` documents private vulnerability reporting
- `CODE_OF_CONDUCT.md` and `CONTRIBUTING.md` are current

## 4. Final GitHub public switch

When checks are green and docs are current:

1. Open repository **Settings**
2. Go to **Danger Zone**
3. Select **Change repository visibility**
4. Set visibility to **Public**
