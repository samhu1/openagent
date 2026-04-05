# Release Checklist

1. Verify CI green on target branch.
2. Run local checks:

```bash
./scripts/oss-check.sh
```

3. Confirm pre-public checklist in `docs/open-source-readiness.md` is complete.
4. Confirm `CHANGELOG.md` is updated.
5. Confirm no secrets/private notes are included.
6. Ensure version bump in `package.json` if needed.
7. Draft release notes and validate install/run steps.
8. Tag release (`vX.Y.Z`) and publish GitHub Release.
9. Verify desktop icon assets resolve in packaged app:
   - `build/icon.icns`
   - `build/icon.ico`
   - `build/icons/png/512x512.png`
