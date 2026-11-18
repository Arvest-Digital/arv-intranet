---
id: T29
title: "Expose allocation and leave write endpoints"
layer: "ports"
deps: ["T23", "T24", "T28"]
acs: ["AC-07", "AC-07a", "AC-07b", "AC-09", "AC-10", "AC-11", "AC-12", "AC-13", "AC-15"]
files_hint: ["packages/contracts/src/scheduling/", "modules/scheduling/src/http/routes.ts", "modules/scheduling/src/http/presenter.ts", "apps/api/test/integration/scheduling/"]
owner: "TBD (backend lead)"
estimate: "M"
status: "done"
---

# T29 — Expose allocation and leave write endpoints

> Layer `ports` · estimate M · blocked by [T23](./t23-scheduling-allocation-commands.md), [T24](./t24-scheduling-book-leave.md), [T28](./t28-scheduling-http-reads.md) · ACs: AC-07, AC-07a, AC-07b, AC-09, AC-10, AC-11, AC-12, AC-13, AC-15

## Why

`createAllocation`, `updateAllocation`, `removeAllocation`, `bookLeave` of [openapi.yaml](../contracts/openapi.yaml); [ADR-0010](../adr/0010-confirm-by-resubmitting-with-typed-confirmation-errors.md).

## What

- Write schemas with `version` and `confirm`; routes; presenter maps each domain error to its contract error and `code`.

Files: `packages/contracts/src/scheduling/`, `modules/scheduling/src/http/routes.ts`, `modules/scheduling/src/http/presenter.ts`, `apps/api/test/integration/scheduling/`

## Definition of Done

- [x] Api integration tests: create 201, overbooking → 409 `ConfirmationRequired` then 201 with `confirm: true`, stale version → 409 `Conflict` with current values, closed project → 409/400 per contract, outside employment → 400 naming the last date, no permission → 403.
- [x] Bodies validate against the OpenAPI examples.
- [x] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- Two contract gaps closed in `openapi.yaml` (additive): `WorkOnLeaveDays.allocationId` is nullable (a new work allocation on existing leave days has no id yet), and `RuleViolations.rules` gains `ends_before_today` (changing an allocation that already ended). Run `/sdlc:api-forge resource-scheduling --reconcile` to refresh `api-sync-report.md`.
- Several broken rules at once answer one code, most fundamental first: `not_a_leave_project` → `invalid_allocation` → `past_not_rewritable` → `outside_employment_period` → `past_project_close_date`; `details.rules` lists them all.
- Write responses and the version-conflict `details.current` go through `viewAllocation`, the same redaction as `getAllocation` (leave type hidden without `see-leave-reasons`, AC-29).
