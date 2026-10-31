---
id: T24
title: "Implement the book-leave use case"
layer: "app"
deps: ["T23"]
acs: ["AC-15", "AC-09b", "AC-12"]
files_hint: ["modules/scheduling/src/application/leave.ts", "modules/scheduling/src/application/ports.ts", "modules/scheduling/src/application/scheduling-api.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T24 — Implement the book-leave use case

> Layer `app` · estimate M · blocked by [T23](./t23-scheduling-allocation-commands.md) · ACs: AC-15, AC-09b, AC-12

## Why

Flow 6 of [sad §6](../sad.md); leave is an allocation to a leave-type project at `full-day` rate ([data-model.md](../data-model.md) segments).

## What

- Whole working days only; project must be `leave` type; `full-day` segment; leave-day conflicts with work allocations → `ConfirmationRequired` naming them; same from-today rule.

Files: `modules/scheduling/src/application/leave.ts`, `modules/scheduling/src/application/ports.ts`, `modules/scheduling/src/application/scheduling-api.ts`

## Definition of Done

- [ ] Use-case tests: AC-15 (5 days at full daily capacity; conflicting work allocation named even when the week fits), leave on a non-leave project refused, leave starting before today refused (AC-09b), missing permission refused (AC-12).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
