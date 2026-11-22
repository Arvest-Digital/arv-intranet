---
id: T18
title: "Expose the working-day start through @arv/contracts/org, the employee-record routes and OrgApi employment terms"
layer: "ports"
deps: ["T17"]
acs: ["AC-27", "AC-27b"]
files_hint: ["packages/contracts/src/org/employee-records.ts", "packages/contracts/src/org/employee-records.test.ts", "modules/org/src/application/employee-records/", "modules/org/src/application/org-api.ts", "modules/org/src/http/employee-record-routes.ts", "modules/org/src/http/presenter.ts", "apps/api/test/integration/org/employee-records.test.ts"]
owner: "TBD lead"
estimate: "M"
stage: "S3"
status: "todo"
---

# T18 — Expose the working-day start through @arv/contracts/org, the employee-record routes and OrgApi employment terms

> Stage 3 — time of day · layer `ports` · estimate M · blocked by T17 · ACs AC-27, AC-27b

## Why

[Flow 12](../sad.md#6-runtime-view); `createEmployeeRecord`, `updateEmployeeRecord` in [openapi.yaml](../contracts/openapi.yaml); [SAD §4 choice 3](../sad.md#4-solution-strategy) (scheduling reads it via OrgApi, no new module edge).

## What

`workingDayStartMinute` (+ computed `workingDayEndMinute`) on the employee-record DTOs; create/change use cases; `OrgApi` employment terms gain the start. Optimistic `version` covers it.

Files: `packages/contracts/src/org/employee-records.ts`, `packages/contracts/src/org/employee-records.test.ts`, `modules/org/src/application/employee-records/`, `modules/org/src/application/org-api.ts`, `modules/org/src/http/employee-record-routes.ts`, `modules/org/src/http/presenter.ts`, `apps/api/test/integration/org/employee-records.test.ts`

## Definition of Done

- [ ] Integration tests show PATCH with 08:00 saving and returning working hours 08:00–16:00 with capacity unchanged (AC-27), 17:00 or an off-step start refused as Invalid with the explanation (AC-27b), a created record starting at 09:00, and OrgApi employment terms carrying the start.
- [ ] Contract tests + integration tests pass
- [ ] No new module edge (`pnpm check:modules`)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

Scheduling consumes the start only through `OrgApi` (facade), never org tables.
