---
id: T33
title: "Add org and projects import commands that join the caller's unit of work"
layer: "app"
deps: ["T10", "T16"]
acs: ["AC-30"]
files_hint: ["modules/org/src/application/import.ts", "modules/org/src/application/org-api.ts", "modules/projects/src/application/import.ts", "modules/projects/src/application/projects-api.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T33 — Add org and projects import commands that join the caller's unit of work

> Layer `app` · estimate M · blocked by [T10](./t10-org-employee-records-app.md), [T16](./t16-projects-app.md) · ACs: AC-30

## Why

The all-or-nothing import creates records in three modules in one transaction ([ADR-0006](../adr/0006-implement-unit-of-work-without-outbox.md); flow 13 of [sad §6](../sad.md)).

## What

- Facade commands: bulk-create employee records (incomplete allowed) and teams; bulk-create projects; both run inside the caller's `UnitOfWork`, with no own transaction.

Files: `modules/org/src/application/import.ts`, `modules/org/src/application/org-api.ts`, `modules/projects/src/application/import.ts`, `modules/projects/src/application/projects-api.ts`

## Definition of Done

- [ ] Integration test: calling both commands inside one `transactional` and then failing leaves no rows in either schema.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
