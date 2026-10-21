---
paths:
  - "turbo.json"
  - "AGENTS.md"
  - "biome.json"
  - "**/package.json"
  - "pnpm-workspace.yaml"
  - "scripts/**"
---
# Tooling

- Leave the Turborepo-managed block in `AGENTS.md` in place.
- Read `node_modules/turbo/docs` before changing turbo config.
- Workspaces: `apps/*`, `modules/*` (except `_template`), `packages/*`, `e2e`. A module's `exports` lists only `.`, `./http`, `./layer`; don't add subpaths that expose internals.
- Never add a workspace dependency that creates a cycle; Turborepo will fail the build. A module → module dependency also needs an edge in `ARCHITECTURE.md`.
- The layer boundary overrides in `biome.json` mirror the import table in `ARCHITECTURE.md`; change both together.
- Root scripts in `scripts/` are `.mts` run with Node type stripping; keep them dependency-free.
