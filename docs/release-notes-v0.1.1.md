# OAgent v0.1.1

Initial public release of OAgent, a desktop workspace for agentic development.

## Highlights

- Rebranded product identity to **OAgent**.
- Electron + React desktop client with multi-session chat workflows.
- Integrated developer tooling panels for source control and project files.
- MCP integration support for connected tool ecosystems.
- Open-source project baseline: governance docs, contribution guidelines, and security policy.

## Technical Notes

- Runtime and workspace architecture clarified in docs.
- Packaging/build setup prepared for desktop distribution.
- Initial release checklist and maintenance docs added.

## Known Limitations

- Rapid force-push/history rewrites may require repo settings and HTTP Git tuning in some environments.
- Some optional integrations depend on local environment setup (model/provider credentials and tool binaries).

## Upgrade / Install

```bash
pnpm install
pnpm dev
```

Build distributables:

```bash
pnpm build
pnpm dist
```
