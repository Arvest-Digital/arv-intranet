---
id: T04
title: "Warn per day on allocation and leave saves (create, change, leave) and map overbookedDays in the presenter"
layer: "app"
deps: ["T01", "T03"]
acs: ["AC-06", "AC-08"]
files_hint: ["modules/scheduling/src/application/allocations/", "modules/scheduling/src/application/leave.ts", "modules/scheduling/src/application/allocations.test.ts", "modules/scheduling/src/application/leave.test.ts", "modules/scheduling/src/http/presenter.ts", "apps/api/test/integration/scheduling/"]
owner: "TBD lead"
estimate: "M"
stage: "S1"
status: "todo"
---

# T04 — Warn per day on allocation and leave saves (create, change, leave) and map overbookedDays in the presenter

> Stage 1 — day view · layer `app` · estimate M · blocked by T01, T03 · ACs AC-06, AC-08

## Why

[Critical flow 2](../sad.md#6-runtime-view), [§8 warn-then-confirm](../sad.md#8-crosscutting-concepts) (`overbookedDays[]`), [resource-scheduling ADR-0010](../../resource-scheduling/adr/).

## What

Use the T01 rule in `create-allocation.ts`, `change-allocation.ts` and `leave.ts`. The `ConfirmationRequired` details carry `overbookedDays` and weeks that name their overbooked days. Map them in `presenter.ts`. Moving leave onto days with work names that work, as the leave form does (AC-13 basis).

Files: `modules/scheduling/src/application/allocations/`, `modules/scheduling/src/application/leave.ts`, `modules/scheduling/src/application/allocations.test.ts`, `modules/scheduling/src/application/leave.test.ts`, `modules/scheduling/src/http/presenter.ts`, `apps/api/test/integration/scheduling/`

## Definition of Done

- [ ] An api integration test reproduces AC-06 (409 confirmation naming Wednesday +8 h and the 40/40 week, then saved with confirm: true) and AC-08 (saved without confirmation), and unit tests for create/change/leave pass.
- [ ] Unit tests per use case pass
- [ ] Integration tests for AC-06 and AC-08 pass against arv_test (`pnpm test:integration`)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

Shares `presenter.ts` with T05/T06 → serialized lane.
