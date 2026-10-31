---
id: T02
title: "Implement UnitOfWorkLive with a CurrentTx FiberRef read by query()"
layer: "infra"
deps: []
acs: ["AC-07b", "AC-25", "AC-31"]
files_hint: ["packages/db/src/unit-of-work.ts", "packages/db/src/database.ts", "packages/db/src/index.ts", "ARCHITECTURE.md"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T02 — Implement UnitOfWorkLive with a CurrentTx FiberRef read by query()

> Layer `infra` · estimate M · blocked by — · ACs: AC-07b, AC-25, AC-31

## Why

Allocation change + history entry, project close + trims, and the all-or-nothing import each commit as one transaction ([ADR-0006](../adr/0006-implement-unit-of-work-without-outbox.md); [sad §4](../sad.md) choice 5).

## What

- `UnitOfWorkLive` implementing the kernel's `UnitOfWork` port: one `db.transaction`, the tx handle stored in a `CurrentTx` FiberRef.
- `query()` uses the FiberRef's tx when set, else the pool connection. Nested `transactional` joins the outer transaction.
- Update `ARCHITECTURE.md` (unit-of-work section) in the same PR.

Files: `packages/db/src/unit-of-work.ts`, `packages/db/src/database.ts`, `packages/db/src/index.ts`, `ARCHITECTURE.md`

## Definition of Done

- [ ] Integration test (real `arv_test` DB): two writes inside `transactional` followed by a failure leave no rows; without the failure both rows exist.
- [ ] Integration test: a nested `transactional` joins the outer one (rollback of the outer rolls back the inner write).
- [ ] `pnpm test:integration` green.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- No outbox / DomainEvents implementation (ADR-0006).
