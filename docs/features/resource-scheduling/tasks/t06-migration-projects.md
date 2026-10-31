---
id: T06
title: "Promote the projects schema: projects"
layer: "migration"
deps: ["T04"]
acs: ["AC-24", "AC-25"]
files_hint: ["docs/features/resource-scheduling/migrations/20261030120002_create_projects.up.sql", "docs/features/resource-scheduling/migrations/20261030120002_create_projects.down.sql", "modules/projects/src/infrastructure/schema.ts", "packages/migrations/drizzle/"]
owner: "TBD (backend lead)"
estimate: "S"
status: "todo"
---

# T06 — Promote the projects schema: projects

> Layer `migration` · estimate S · blocked by [T04](./t04-scaffold-modules.md) · ACs: AC-24, AC-25

## Why

`projects.projects` with the name-key index per [data-model.md](../data-model.md) (Aggregate Project).

## What

- `modules/projects/src/infrastructure/schema.ts` (`pgSchema('projects')`, `idx_projects_name_key` on `lower(btrim(name))`, non-unique).
- `pnpm db:generate`.

Files: `docs/features/resource-scheduling/migrations/20261030120002_create_projects.up.sql`, `docs/features/resource-scheduling/migrations/20261030120002_create_projects.down.sql`, `modules/projects/src/infrastructure/schema.ts`, `packages/migrations/drizzle/`

## Definition of Done

- [ ] Generated SQL matches the staged `.up.sql`.
- [ ] `pnpm db:migrate` applies cleanly; `pnpm db:status` clean.
- [ ] `pnpm test:integration` green.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- Repo workflow wins over the course default: write `schema.ts`, run `pnpm db:generate`, and diff the generated SQL against the staged `.up.sql` (the spec). Staged `.down.sql` is documentation only — drizzle has no down migrations. Never hand-write files into `packages/migrations/drizzle/`.
