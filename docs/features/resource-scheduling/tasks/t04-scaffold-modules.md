---
id: T04
title: "Scaffold org, projects and scheduling modules and register them"
layer: "wiring"
deps: []
acs: []
files_hint: ["modules/org/", "modules/projects/", "modules/scheduling/", "apps/api/src/composition.ts", "apps/api/src/index.ts", "packages/migrations/drizzle.config.ts", "ARCHITECTURE.md"]
owner: "TBD (backend lead)"
estimate: "S"
status: "todo"
---

# T04 — Scaffold org, projects and scheduling modules and register them

> Layer `wiring` · estimate S · blocked by — · ACs: — (enabling task)

## Why

Three hexagonal modules per [ADR-0003](../adr/0003-split-into-org-projects-scheduling-modules.md) and [sad §5](../sad.md); module edges `org → identity`, `scheduling → org`, `scheduling → projects` approved there.

## What

- `pnpm new:module org|projects|scheduling`; empty Layers registered in `composition.ts`; empty route groups mounted at `/org`, `/projects`, `/scheduling` in `index.ts`.
- Add `org`, `projects`, `scheduling` to `schemaFilter` in `drizzle.config.ts`.
- `ARCHITECTURE.md`: module catalog + `module-graph` block with the three edges.

Files: `modules/org/`, `modules/projects/`, `modules/scheduling/`, `apps/api/src/composition.ts`, `apps/api/src/index.ts`, `packages/migrations/drizzle.config.ts`, `ARCHITECTURE.md`

## Definition of Done

- [ ] `pnpm check:modules` passes with the three new edges and no cycle.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` green; api boots in `pnpm dev`.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- No business code here — later tasks fill each layer.
