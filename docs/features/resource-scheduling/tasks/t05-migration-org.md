---
id: T05
title: "Promote the org schema: teams, employee_records, public_holidays"
layer: "migration"
deps: ["T04"]
acs: ["AC-06", "AC-19b", "AC-19d"]
files_hint: ["docs/features/resource-scheduling/migrations/20261030120000_create_teams_and_employee_records.up.sql", "docs/features/resource-scheduling/migrations/20261030120001_create_public_holidays.up.sql", "docs/features/resource-scheduling/migrations/20261030120000_create_teams_and_employee_records.down.sql", "docs/features/resource-scheduling/migrations/20261030120001_create_public_holidays.down.sql", "modules/org/src/infrastructure/schema.ts", "packages/migrations/drizzle/"]
owner: "TBD (backend lead)"
estimate: "S"
status: "todo"
---

# T05 — Promote the org schema: teams, employee_records, public_holidays

> Layer `migration` · estimate S · blocked by [T04](./t04-scaffold-modules.md) · ACs: AC-06, AC-19b, AC-19d

## Why

Tables, uniques and indexes of the `org` schema per [data-model.md](../data-model.md) (Aggregates Team, Employee record, Public holiday; Indexes).

## What

- `modules/org/src/infrastructure/schema.ts` with `pgSchema('org')`, the three tables, `smallint().array()`, the `lower(btrim(name))` unique index, `user_id` unique, FK RESTRICTs.
- `pnpm db:generate` → one new drizzle migration.

Files: `docs/features/resource-scheduling/migrations/20261030120000_create_teams_and_employee_records.up.sql`, `docs/features/resource-scheduling/migrations/20261030120001_create_public_holidays.up.sql`, `docs/features/resource-scheduling/migrations/20261030120000_create_teams_and_employee_records.down.sql`, `docs/features/resource-scheduling/migrations/20261030120001_create_public_holidays.down.sql`, `modules/org/src/infrastructure/schema.ts`, `packages/migrations/drizzle/`

## Definition of Done

- [ ] Generated SQL matches the staged `.up.sql` files column for column (differences listed in the PR, if any).
- [ ] `pnpm db:migrate` applies on a clean docker DB and `pnpm db:status` reports no pending/changed migration.
- [ ] `pnpm test:integration` green.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- Repo workflow wins over the course default: write `schema.ts`, run `pnpm db:generate`, and diff the generated SQL against the staged `.up.sql` (the spec). Staged `.down.sql` is documentation only — drizzle has no down migrations. Never hand-write files into `packages/migrations/drizzle/`.
