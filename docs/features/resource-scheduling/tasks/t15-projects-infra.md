---
id: T15
title: "Add the projects Drizzle repository and fixtures"
layer: "infra"
deps: ["T02", "T06", "T14"]
acs: ["AC-23", "AC-24"]
files_hint: ["modules/projects/src/infrastructure/", "modules/projects/src/application/ports.ts", "packages/db/src/testing/seed.ts"]
owner: "TBD (backend lead)"
estimate: "S"
status: "todo"
---

# T15 — Add the projects Drizzle repository and fixtures

> Layer `infra` · estimate S · blocked by [T02](./t02-unit-of-work-live.md), [T06](./t06-migration-projects.md), [T14](./t14-projects-domain.md) · ACs: AC-23, AC-24

## Why

Persistence per [data-model.md](../data-model.md) (Aggregate Project).

## What

- Repository port + Drizzle adapter: create, get, list (by type / ids), find open by name key on a date.
- Fixtures `makeProject/seedProjects`.

Files: `modules/projects/src/infrastructure/`, `modules/projects/src/application/ports.ts`, `packages/db/src/testing/seed.ts`

## Definition of Done

- [ ] Integration tests: find-open-by-name ignores a closed project with the same key; list by ids returns names and types.
- [ ] `pnpm test:integration` green.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- Shares `packages/db/src/testing/seed.ts` with T09 / T22 — serialized lane.
