---
id: T17
title: "Promote staged migration 120001: add org.employee_records.working_day_start_minute (one-shot DEFAULT 540, dropped)"
layer: "migration"
deps: ["T14", "T16"]
acs: ["AC-27"]
files_hint: ["docs/features/schedule-daily-view/migrations/20261122120001_alter_employee_records_working_day_start.up.sql", "docs/features/schedule-daily-view/migrations/20261122120001_alter_employee_records_working_day_start.down.sql", "modules/org/src/infrastructure/schema.ts", "packages/migrations/drizzle/", "modules/org/src/infrastructure/drizzle-employee-record-repository.ts", "packages/db/src/testing/seed-org.ts"]
owner: "TBD lead"
estimate: "S"
stage: "S3"
status: "todo"
---

# T17 — Promote staged migration 120001: add org.employee_records.working_day_start_minute (one-shot DEFAULT 540, dropped)

> Stage 3 — time of day · layer `migration` · estimate S · blocked by T14, T16 · ACs AC-27

## Why

[data-model decision 2](../data-model.md) and promote-time recipe; [SAD §2 override (org part)](../sad.md#2-constraints).

## What

`workingDayStartMinute: integer().notNull()` with **no** `.default()` in `org/infrastructure/schema.ts`; `pnpm db:generate`; replace the bare NOT NULL ADD COLUMN with the two statements from the staged up file. Repository read/write; `seedEmployeeRecords` gets an optional `workingDayStartMinute` defaulting to 540 **in the helper**.

Files: `docs/features/schedule-daily-view/migrations/20261122120001_alter_employee_records_working_day_start.up.sql`, `docs/features/schedule-daily-view/migrations/20261122120001_alter_employee_records_working_day_start.down.sql`, `modules/org/src/infrastructure/schema.ts`, `packages/migrations/drizzle/`, `modules/org/src/infrastructure/drizzle-employee-record-repository.ts`, `packages/db/src/testing/seed-org.ts`

## Definition of Done

- [ ] The drizzle-generated migration, hand-edited to add the column with DEFAULT 540 and then drop the default, applies on a seeded arv_test (existing rows get 540), db:generate reports no changes, the repository round-trips workingDayStartMinute, and pnpm test:integration passes.
- [ ] Staged migration promoted via drizzle-kit, applies on an arv_test with rows
- [ ] Repository integration test passes
- [ ] Snapshot consistent: final state has no default
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

Migration lane: after T16 (serialized). Its own generated migration file, separate from T16's.
