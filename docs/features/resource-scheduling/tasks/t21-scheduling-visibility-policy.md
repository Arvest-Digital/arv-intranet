---
id: T21
title: "Implement the scheduling permission and visibility policy"
layer: "domain"
deps: ["T01"]
acs: ["AC-03", "AC-12b", "AC-17", "AC-22", "AC-29"]
files_hint: ["modules/scheduling/src/domain/visibility.ts", "modules/scheduling/src/domain/visibility.test.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T21 — Implement the scheduling permission and visibility policy

> Layer `domain` · estimate M · blocked by [T01](./t01-permissions-on-actor.md) · ACs: AC-03, AC-12b, AC-17, AC-22, AC-29

## Why

One policy decides what leaves the api per viewer ([sad §8](../sad.md) Authorization, Visibility; [ADR-0004](../adr/0004-resolve-permissions-into-actor-per-request.md); [sad §10](../sad.md) QG-2).

## What

- `canViewBoard` (view-whole-board or edit-allocations — AC-12b), `canEdit`.
- Leave type → «away» unless see-leave-reasons or own resource; end date, allocations after it and needing-attention marks only for manage-employee-records or edit-allocations; otherwise weeks after the end compute without those allocations.

Files: `modules/scheduling/src/domain/visibility.ts`, `modules/scheduling/src/domain/visibility.test.ts`

## Definition of Done

- [ ] Table-driven tests over every permission combination × {own, other} resource asserting what is visible (AC-03, AC-12b, AC-17, AC-22, AC-29).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
