---
id: T16
title: "Promote staged migration 120000: replace the rate with the daily time interval in scheduling storage, domain and contract"
layer: "migration"
deps: ["T04", "T05", "T06", "T12"]
acs: ["AC-23", "AC-24"]
files_hint: ["docs/features/schedule-daily-view/migrations/20261122120000_alter_allocation_segments_time_interval.up.sql", "docs/features/schedule-daily-view/migrations/20261122120000_alter_allocation_segments_time_interval.down.sql", "modules/scheduling/src/infrastructure/schema.ts", "packages/migrations/drizzle/", "modules/scheduling/src/infrastructure/drizzle-allocation-repository.ts", "modules/scheduling/src/infrastructure/drizzle-history-repository.ts", "modules/scheduling/src/domain/allocation.ts", "modules/scheduling/src/domain/weekly-figures.ts", "packages/contracts/src/scheduling/writes.ts", "packages/contracts/src/scheduling/reads.ts", "packages/db/src/testing/seed-scheduling.ts", "apps/web/app/features/scheduling/components/allocation-dialog.tsx"]
owner: "TBD lead"
estimate: "L"
stage: "S3"
status: "todo"
---

# T16 — Promote staged migration 120000: replace the rate with the daily time interval in scheduling storage, domain and contract

> Stage 3 — time of day · layer `migration` · estimate L · blocked by T04, T05, T06, T12 · ACs AC-23, AC-24

## Why

[ADR-0002](../adr/0002-store-daily-time-interval-as-minutes-on-segments-and-drop-the-rate.md), [ADR-0003](../adr/0003-replace-the-rate-without-converting-pre-production-allocations.md) (no conversion, pre-production one-step drop), [SAD §2 override](../sad.md#2-constraints); [data-model promote-time recipe](../data-model.md#migrations-staged) and [«History snapshots»](../data-model.md#history-snapshots-code-impact-not-schema).

## What

Follow the data-model recipe: in `scheduling/infrastructure/schema.ts` drop `rateMinutes`/`ratePeriod`, add `startsAtMinute`/`endsAtMinute`; `pnpm db:generate`; prepend the guard from the staged up file. Domain `Segment` carries an interval (NULL ⇔ leave, kind `full-day`), hours per day = interval length. Repository mapping, seed helper (`seedAllocations`), history decoder accepting the legacy leave shape. Contract `AllocationSegment`/`AllocationCreate`/`AllocationChange` lose the rate and gain the interval (non-additive, S3 exception). Minimal swap of the dialog's rate input to two time inputs so the web still typechecks; the full UX is T22. The import keeps compiling and refuses rate rows until T21.

Files: `docs/features/schedule-daily-view/migrations/20261122120000_alter_allocation_segments_time_interval.up.sql`, `docs/features/schedule-daily-view/migrations/20261122120000_alter_allocation_segments_time_interval.down.sql`, `modules/scheduling/src/infrastructure/schema.ts`, `packages/migrations/drizzle/`, `modules/scheduling/src/infrastructure/drizzle-allocation-repository.ts`, `modules/scheduling/src/infrastructure/drizzle-history-repository.ts`, `modules/scheduling/src/domain/allocation.ts`, `modules/scheduling/src/domain/weekly-figures.ts`, `packages/contracts/src/scheduling/writes.ts`, `packages/contracts/src/scheduling/reads.ts`, `packages/db/src/testing/seed-scheduling.ts`, `apps/web/app/features/scheduling/components/allocation-dialog.tsx`

## Definition of Done

- [ ] The drizzle-generated migration (with the guard DO block prepended) applies cleanly on arv_test, pnpm db:generate then reports no changes and db:status is clean, pnpm test:integration passes, and a unit test decodes a legacy leave history snapshot (rateMinutes null, ratePeriod full-day) as a segment with no interval.
- [ ] Staged migration promoted to `packages/migrations/drizzle/` via drizzle-kit (never hand-written), applies on a fresh and on a seeded arv_test
- [ ] Guard aborts when a work segment exists (integration test)
- [ ] Legacy-leave snapshot decoder unit test passes
- [ ] pnpm lint + typecheck + test + test:integration green
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

The one task close to ~600 LOC: the non-additive swap cannot be split while keeping typecheck green (ADR-0003 one-step override). Mostly deletions plus mechanical renames. Migration lane: runs before T17. Never edit an applied migration; a rollback is a new forward migration (`.claude/rules/backend/db.md`). The staged `.down.sql` is documentation only.
