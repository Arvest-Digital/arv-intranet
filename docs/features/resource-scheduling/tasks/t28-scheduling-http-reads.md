---
id: T28
title: "Expose board, free-list, my-schedule, allocation and history read endpoints"
layer: "ports"
deps: ["T03", "T25", "T26"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-16", "AC-17", "AC-18", "AC-29"]
files_hint: ["packages/contracts/src/scheduling/", "modules/scheduling/src/http/routes.ts", "modules/scheduling/src/http/presenter.ts", "apps/api/test/integration/scheduling/"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T28 — Expose board, free-list, my-schedule, allocation and history read endpoints

> Layer `ports` · estimate M · blocked by [T03](./t03-contract-errors.md), [T25](./t25-scheduling-board-free-list.md), [T26](./t26-scheduling-my-schedule-history.md) · ACs: AC-01, AC-02, AC-03, AC-04, AC-05, AC-16, AC-17, AC-18, AC-29

## Why

`getBoard`, `getFreeList`, `getMySchedule`, `getAllocation`, `listAllocationHistory` of [openapi.yaml](../contracts/openapi.yaml); redacted fields always present as `null` ([api-sync-report.md](../contracts/api-sync-report.md) Notes).

## What

- `@arv/contracts/scheduling` read schemas; routes; presenter maps errors and builds DTOs from already-redacted results.

Files: `packages/contracts/src/scheduling/`, `modules/scheduling/src/http/routes.ts`, `modules/scheduling/src/http/presenter.ts`, `apps/api/test/integration/scheduling/`

## Definition of Done

- [ ] Api integration tests: board 200 with default window, window out of range → 400, free list bad weeks → 400 with the AC-05 message, my-schedule unlinked → the AC-18 error, no permission → 403.
- [ ] Bodies validate against the OpenAPI examples.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- —
