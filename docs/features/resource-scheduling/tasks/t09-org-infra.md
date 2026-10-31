---
id: T09
title: "Add org Drizzle repositories and test fixtures"
layer: "infra"
deps: ["T02", "T05", "T08"]
acs: ["AC-19a", "AC-19b", "AC-19d"]
files_hint: ["modules/org/src/infrastructure/", "modules/org/src/application/ports.ts", "packages/db/src/testing/seed.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T09 — Add org Drizzle repositories and test fixtures

> Layer `infra` · estimate M · blocked by [T02](./t02-unit-of-work-live.md), [T05](./t05-migration-org.md), [T08](./t08-org-domain.md) · ACs: AC-19a, AC-19b, AC-19d

## Why

Persistence for employee records (version-guarded update), teams and holidays per [data-model.md](../data-model.md) and [sad §8](../sad.md) Concurrency.

## What

- Repository ports in `application/ports.ts` + Drizzle adapters: employee records (`UPDATE … WHERE version = $n`), find by login, teams with member count, holidays in a date range.
- Fixtures `makeTeam/seedTeams`, `makeEmployeeRecord/seedEmployeeRecords`, `makePublicHoliday/seedPublicHolidays` in raw SQL (data-model §Test fixtures; `@example.test` emails).

Files: `modules/org/src/infrastructure/`, `modules/org/src/application/ports.ts`, `packages/db/src/testing/seed.ts`

## Definition of Done

- [ ] Integration tests: version mismatch updates 0 rows; a second login link hits the unique index and surfaces as a domain conflict; holidays range query returns only in-range dates.
- [ ] `pnpm test:integration` green.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- —
