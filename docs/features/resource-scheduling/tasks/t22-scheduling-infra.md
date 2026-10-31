---
id: T22
title: "Add scheduling Drizzle repositories and fixtures"
layer: "infra"
deps: ["T02", "T07", "T19"]
acs: ["AC-07", "AC-07a", "AC-07b", "AC-16"]
files_hint: ["modules/scheduling/src/infrastructure/", "modules/scheduling/src/application/ports.ts", "packages/db/src/testing/seed.ts"]
owner: "TBD (backend lead)"
estimate: "L"
status: "todo"
---

# T22 — Add scheduling Drizzle repositories and fixtures

> Layer `infra` · estimate L · blocked by [T02](./t02-unit-of-work-live.md), [T07](./t07-migration-scheduling.md), [T19](./t19-scheduling-allocation-aggregate.md) · ACs: AC-07, AC-07a, AC-07b, AC-16

## Why

Aggregate persistence with version guard and history in the same transaction ([data-model.md](../data-model.md); [ADR-0008](../adr/0008-model-allocation-as-effective-dated-segments.md); [ADR-0006](../adr/0006-implement-unit-of-work-without-outbox.md)).

## What

- Allocation repository: load with segments, save (insert / version-guarded update replacing future segments / delete), segments overlapping a window (by employees / project).
- History repository: append, list for an allocation within 12 months, delete before cut-off. Import-runs repository: exists, insert.
- Fixtures `makeAllocation/seedAllocations`, `makeHistoryEntry/seedAllocationHistory`.

Files: `modules/scheduling/src/infrastructure/`, `modules/scheduling/src/application/ports.ts`, `packages/db/src/testing/seed.ts`

## Definition of Done

- [ ] Integration tests: stale version → 0 rows → `Conflict` (AC-07b); deleting an allocation keeps its history rows (AC-07a); window query returns only overlapping segments.
- [ ] `pnpm test:integration` green.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- —
