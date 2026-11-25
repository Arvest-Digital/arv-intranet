---
id: T03
title: "Add the stage 1 contract shapes (day view, per-day impact) to @arv/contracts/scheduling and the base contract"
layer: "ports"
deps: []
acs: ["AC-01", "AC-06", "AC-07"]
files_hint: ["packages/contracts/src/scheduling/reads.ts", "packages/contracts/src/scheduling/reads.test.ts", "packages/contracts/src/scheduling/writes.ts", "packages/contracts/src/scheduling/errors.ts", "docs/features/resource-scheduling/contracts/openapi.yaml"]
owner: "TBD lead"
estimate: "S"
stage: "S1"
status: "todo"
---

# T03 — Add the stage 1 contract shapes (day view, per-day impact) to @arv/contracts/scheduling and the base contract

> Stage 1 — day view · layer `ports` · estimate S · blocked by — · ACs AC-01, AC-06, AC-07

## Why

[openapi.yaml](../contracts/openapi.yaml) `x-stage: S1` schemas; [api-sync-report D-4](../contracts/api-sync-report.md#section-d--deferrals) asks for one task per stage to fold the delta into the base contract.

## What

Effect Schemas for `DayView`, `DayViewRow`, `DayCell`, `MyDayView`, the window query (`from`, `weeks` 1–4, `team`, `project`), the `window_out_of_range` error, and the additive `overbookedDays` on `BoardCell`, `AllocationImpact` (`DayOver`) and `WeekOver`. Keep the **rate** segment shape (D-5; S3 replaces it in T17). Fold the same S1 schemas into `resource-scheduling/contracts/openapi.yaml`.

Files: `packages/contracts/src/scheduling/reads.ts`, `packages/contracts/src/scheduling/reads.test.ts`, `packages/contracts/src/scheduling/writes.ts`, `packages/contracts/src/scheduling/errors.ts`, `docs/features/resource-scheduling/contracts/openapi.yaml`

## Definition of Done

- [ ] Contract schema tests decode the openapi.yaml S1 examples for DayView, MyDayView, DayCell, BoardCell.overbookedDays, AllocationImpact.overbookedDays and WeekOver.overbookedDays; the change is additive and lint + typecheck are clean.
- [ ] Schema tests round-trip the openapi examples
- [ ] No existing contract test changes (additive)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Contracts depend on `effect` only. Web consumes these from `@arv/contracts/scheduling`.
