---
id: T16
title: "Implement create and close-with-preview use cases, the ProjectClosingHook port and the projects facade"
layer: "app"
deps: ["T15"]
acs: ["AC-23", "AC-24", "AC-25", "AC-26"]
files_hint: ["modules/projects/src/application/", "modules/projects/src/index.ts", "modules/projects/src/layer.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T16 — Implement create and close-with-preview use cases, the ProjectClosingHook port and the projects facade

> Layer `app` · estimate M · blocked by [T15](./t15-projects-infra.md) · ACs: AC-23, AC-24, AC-25, AC-26

## Why

Critical flow 2 and flow 11 of [sad §6](../sad.md); closing inverts into scheduling via `ProjectClosingHook` ([ADR-0007](../adr/0007-invert-capacity-and-close-checks-through-host-wired-ports.md)) inside one unit of work ([ADR-0006](../adr/0006-implement-unit-of-work-without-outbox.md)).

## What

- Create (permission `projects:manage-projects`, open-name uniqueness).
- Close: validate date, call `ProjectClosingHook.preview` → `ConfirmationRequired` with the list; on confirm, inside `UnitOfWork.transactional` record the close date and call `ProjectClosingHook.apply`.
- `ProjectClosingHook` port exported from the facade with a no-op default Layer.
- Facade `projects-api.ts`: get / list by ids, `isOpenOn`.

Files: `modules/projects/src/application/`, `modules/projects/src/index.ts`, `modules/projects/src/layer.ts`

## Definition of Done

- [ ] Use-case tests: AC-23, AC-24 refusal, AC-26 `Forbidden`, close-date-before-today refused, closing an already closed project refused.
- [ ] Use-case test: unconfirmed close returns the fake hook's preview; confirmed close calls `apply` within the same transaction (fake UoW asserts it).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
