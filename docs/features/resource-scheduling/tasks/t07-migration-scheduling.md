---
id: T07
title: "Promote the scheduling schema: allocations, segments, history, import_runs"
layer: "migration"
deps: ["T04"]
acs: ["AC-07b", "AC-16", "AC-32"]
files_hint: ["docs/features/resource-scheduling/migrations/20261030120003_create_allocations.up.sql", "docs/features/resource-scheduling/migrations/20261030120004_create_allocation_history.up.sql", "docs/features/resource-scheduling/migrations/20261030120005_create_import_runs.up.sql", "docs/features/resource-scheduling/migrations/20261030120003_create_allocations.down.sql", "docs/features/resource-scheduling/migrations/20261030120004_create_allocation_history.down.sql", "docs/features/resource-scheduling/migrations/20261030120005_create_import_runs.down.sql", "modules/scheduling/src/infrastructure/schema.ts", "packages/migrations/drizzle/"]
owner: "TBD (backend lead)"
estimate: "S"
status: "todo"
---

# T07 — Promote the scheduling schema: allocations, segments, history, import_runs

> Layer `migration` · estimate S · blocked by [T04](./t04-scaffold-modules.md) · ACs: AC-07b, AC-16, AC-32

## Why

Allocation aggregate tables, history (no FK on purpose) and the one-time `import_runs ((true))` unique per [data-model.md](../data-model.md) and [ADR-0008](../adr/0008-model-allocation-as-effective-dated-segments.md).

## What

- `modules/scheduling/src/infrastructure/schema.ts` (`pgSchema('scheduling')`, segment FK CASCADE, `jsonb` before/after values, the indexes of data-model §Indexes incl. `import_runs_one_time_unique`).
- `pnpm db:generate`.

Files: `docs/features/resource-scheduling/migrations/20261030120003_create_allocations.up.sql`, `docs/features/resource-scheduling/migrations/20261030120004_create_allocation_history.up.sql`, `docs/features/resource-scheduling/migrations/20261030120005_create_import_runs.up.sql`, `docs/features/resource-scheduling/migrations/20261030120003_create_allocations.down.sql`, `docs/features/resource-scheduling/migrations/20261030120004_create_allocation_history.down.sql`, `docs/features/resource-scheduling/migrations/20261030120005_create_import_runs.down.sql`, `modules/scheduling/src/infrastructure/schema.ts`, `packages/migrations/drizzle/`

## Definition of Done

- [ ] Generated SQL matches the staged `.up.sql` files.
- [ ] `pnpm db:migrate` applies cleanly; `pnpm db:status` clean.
- [ ] Integration test: inserting a second `import_runs` row fails on the unique index.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- Repo workflow wins over the course default: write `schema.ts`, run `pnpm db:generate`, and diff the generated SQL against the staged `.up.sql` (the spec). Staged `.down.sql` is documentation only — drizzle has no down migrations. Never hand-write files into `packages/migrations/drizzle/`.
