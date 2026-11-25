---
id: T19
title: "Validate the time interval on allocation saves, apply interval changes from today, and add time overlaps to the impact"
layer: "app"
deps: ["T15", "T16"]
acs: ["AC-23", "AC-24", "AC-25", "AC-26"]
files_hint: ["modules/scheduling/src/application/allocations/", "modules/scheduling/src/application/allocations.test.ts", "modules/scheduling/src/domain/allocation.ts", "modules/scheduling/src/http/presenter.ts", "packages/contracts/src/scheduling/writes.ts", "apps/api/test/integration/scheduling/allocations-time.test.ts"]
owner: "TBD lead"
estimate: "M"
stage: "S3"
status: "todo"
---

# T19 — Validate the time interval on allocation saves, apply interval changes from today, and add time overlaps to the impact

> Stage 3 — time of day · layer `app` · estimate M · blocked by T15, T16 · ACs AC-23, AC-24, AC-25, AC-26

## Why

[Critical flow 2, flow 11](../sad.md#6-runtime-view); [§8 warn-then-confirm](../sad.md#8-crosscutting-concepts) (`timeOverlaps[]`); [ADR-0002](../adr/0002-store-daily-time-interval-as-minutes-on-segments-and-drop-the-rate.md); [resource-scheduling ADR-0008](../../resource-scheduling/adr/) effective-dated segments.

## What

Create/change use the domain interval invariants (both set or both NULL, NULL ⇔ leave project, 0 ≤ start < end ≤ 1440, 15-minute steps). A change on a started allocation ends the current segment yesterday and opens one from today. `ConfirmationRequired` details add `timeOverlaps` from T15 alongside the per-day/per-week overbooking. Leave asks for no times.

Files: `modules/scheduling/src/application/allocations/`, `modules/scheduling/src/application/allocations.test.ts`, `modules/scheduling/src/domain/allocation.ts`, `modules/scheduling/src/http/presenter.ts`, `packages/contracts/src/scheduling/writes.ts`, `apps/api/test/integration/scheduling/allocations-time.test.ts`

## Definition of Done

- [ ] Integration tests show an off-step or end-not-after-start interval refused as Invalid (AC-24), an interval change on a started allocation creating a segment from today with past days kept (AC-23), the AC-25 overlap returned as timeOverlaps naming both projects and saved after confirm, and the AC-26 17:00–19:00 save with no warning.
- [ ] Unit tests per rule pass
- [ ] Integration tests for AC-23–AC-26 pass
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

Shares `presenter.ts` and `allocations/` with T16 → serialized after it.
