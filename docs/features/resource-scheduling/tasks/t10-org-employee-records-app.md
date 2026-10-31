---
id: T10
title: "Implement employee-record use cases, the CapacityImpactCheck port and the org facade"
layer: "app"
deps: ["T09"]
acs: ["AC-19a", "AC-19b", "AC-19", "AC-19c", "AC-20", "AC-21", "AC-22"]
files_hint: ["modules/org/src/application/employee-records.ts", "modules/org/src/application/ports.ts", "modules/org/src/application/org-api.ts", "modules/org/src/index.ts", "modules/org/src/layer.ts"]
owner: "TBD (backend lead)"
estimate: "L"
status: "todo"
---

# T10 — Implement employee-record use cases, the CapacityImpactCheck port and the org facade

> Layer `app` · estimate L · blocked by [T09](./t09-org-infra.md) · ACs: AC-19a, AC-19b, AC-19, AC-19c, AC-20, AC-21, AC-22

## Why

Flow 9 of [sad §6](../sad.md); the capacity-impact preview is inverted through a port owned by org ([ADR-0007](../adr/0007-invert-capacity-and-close-checks-through-host-wired-ports.md)); confirmation by resubmit ([ADR-0010](../adr/0010-confirm-by-resubmitting-with-typed-confirmation-errors.md)).

## What

- Create / edit / link-login use cases checking `org:manage-employee-records`; optimistic version → `Conflict` with current values.
- `CapacityImpactCheck` port (exported from the facade) with a **no-op default Layer**; contract-hours / working-days edits call it and return `ConfirmationRequired` unless `confirm: true`.
- Ending the employment period keeps later allocations (AC-21 — no call into scheduling beyond the impact check).
- Facade `org-api.ts`: employment terms + holidays for a resource set and window, employee by login, resources in team.

Files: `modules/org/src/application/employee-records.ts`, `modules/org/src/application/ports.ts`, `modules/org/src/application/org-api.ts`, `modules/org/src/index.ts`, `modules/org/src/layer.ts`

## Definition of Done

- [ ] Use-case tests with in-memory fakes: AC-19a, AC-19b (names the record already linked), AC-19, AC-20, AC-22 (missing permission → `Forbidden`).
- [ ] Use-case test: a contract-hours edit with a fake impact check returning weeks yields `ConfirmationRequired`; with `confirm: true` it saves.
- [ ] Facade test: terms for a window include end dates (redaction happens in presenters, not here).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- Shares `ports.ts` / `org-api.ts` with T11 — implement-tasks serializes them.
