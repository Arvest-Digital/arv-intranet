---
id: T12
title: "Expose employee-record endpoints with end-date redaction"
layer: "ports"
deps: ["T03", "T10"]
acs: ["AC-19a", "AC-19b", "AC-19", "AC-20", "AC-22"]
files_hint: ["packages/contracts/src/org/", "modules/org/src/http/routes.ts", "modules/org/src/http/presenter.ts", "apps/api/test/integration/org/"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T12 — Expose employee-record endpoints with end-date redaction

> Layer `ports` · estimate M · blocked by [T03](./t03-contract-errors.md), [T10](./t10-org-employee-records-app.md) · ACs: AC-19a, AC-19b, AC-19, AC-20, AC-22

## Why

`/org/employee-records*` operations of [openapi.yaml](../contracts/openapi.yaml); end date hidden from viewers without the permission ([sad §8](../sad.md) Visibility; [PRD §5](../PRD.md) AC-22).

## What

- `@arv/contracts/org` schemas for employee records; routes `listEmployeeRecords`, `createEmployeeRecord`, `getEmployeeRecord`, `updateEmployeeRecord`.
- Presenter maps org domain errors → contract errors (`Forbidden`, `Conflict`, `ConfirmationRequired`, `ValidationError`) with the OpenAPI `code`s.

Files: `packages/contracts/src/org/`, `modules/org/src/http/routes.ts`, `modules/org/src/http/presenter.ts`, `apps/api/test/integration/org/`

## Definition of Done

- [ ] Api integration tests (workerd + `arv_test`): create → 201, invalid hours → 400 naming the rule, second login link → 409 naming the linked record, missing permission → 403.
- [ ] Response bodies validate against the OpenAPI examples for these operations.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- —
