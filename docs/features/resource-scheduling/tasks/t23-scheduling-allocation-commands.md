---
id: T23
title: "Implement create, change and remove allocation use cases"
layer: "app"
deps: ["T10", "T16", "T20", "T21", "T22"]
acs: ["AC-07", "AC-07a", "AC-07b", "AC-09", "AC-09b", "AC-10", "AC-11", "AC-12", "AC-13", "AC-14", "AC-21b"]
files_hint: ["modules/scheduling/src/application/allocations.ts", "modules/scheduling/src/application/ports.ts", "modules/scheduling/src/application/scheduling-api.ts", "modules/scheduling/src/layer.ts"]
owner: "TBD (backend lead)"
estimate: "L"
status: "todo"
---

# T23 — Implement create, change and remove allocation use cases

> Layer `app` · estimate L · blocked by [T10](./t10-org-employee-records-app.md), [T16](./t16-projects-app.md), [T20](./t20-scheduling-weekly-figures.md), [T21](./t21-scheduling-visibility-policy.md), [T22](./t22-scheduling-infra.md) · ACs: AC-07, AC-07a, AC-07b, AC-09, AC-09b, AC-10, AC-11, AC-12, AC-13, AC-14, AC-21b

## Why

Critical flow 1 and flow 5 of [sad §6](../sad.md); warn-then-confirm ([ADR-0010](../adr/0010-confirm-by-resubmitting-with-typed-confirmation-errors.md)).

## What

- Check `scheduling:edit-allocations` per call; read project openness and employment terms through the org / projects facades; load segments; apply the aggregate; compute overbooking impact → `ConfirmationRequired` unless confirmed; persist + history in one `UnitOfWork`.

Files: `modules/scheduling/src/application/allocations.ts`, `modules/scheduling/src/application/ports.ts`, `modules/scheduling/src/application/scheduling-api.ts`, `modules/scheduling/src/layer.ts`

## Definition of Done

- [ ] Use-case tests (fakes for org/projects facades and repos): AC-07 (saved with last changed by/at), AC-07a, AC-07b conflict carries current values, AC-10 warning then save on confirm, AC-11, AC-12, AC-13, AC-21b.
- [ ] Use-case test: permissions are read from the Actor of each call (AC-14) — a revoked grant refuses the next save.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
