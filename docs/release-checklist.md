# Release Checklist

1. Verify CI green on target branch.
2. Run local checks:

```bash
./scripts/oss-check.sh
```

3. Confirm `CHANGELOG.md` is updated.
4. Confirm no secrets/private notes are included.
5. Ensure version bump in `package.json` if needed.
6. Draft release notes and validate install/run steps.
7. Tag release (`vX.Y.Z`) and publish GitHub Release.
