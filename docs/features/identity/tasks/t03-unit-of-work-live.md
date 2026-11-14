---
id: T03
title: "Implement UnitOfWorkLive with a CurrentTx FiberRef read by query()"
layer: "infra"
deps: []
acs: ["AC-14"]
files_hint: ["packages/db/src/unit-of-work.ts", "packages/db/src/database.ts", "packages/db/src/index.ts", "ARCHITECTURE.md"]
owner: "TBD (backend lead)"
estimate: "M"
status: "done"
---

# T03 — Implement UnitOfWorkLive with a CurrentTx FiberRef read by query()

> Layer `infra` · estimate M · blocked by — · ACs: AC-14 ([PRD §5](../PRD.md))

## Why

The last-admin guard runs «apply, verify, roll back» in one transaction ([sad §5](../sad.md) tactical decisions; [sad §8](../sad.md) Transactions). Planned by resource-scheduling ADR-0006.

## What

- `UnitOfWorkLive` implementing the kernel's `UnitOfWork` port: one `db.transaction`, with the tx handle in a `CurrentTx` FiberRef.
- `query()` uses the FiberRef's tx when set, else the pool. A nested `transactional` joins the outer transaction.
- Update `ARCHITECTURE.md` (unit-of-work section) in the same PR.

Files: `packages/db/src/unit-of-work.ts`, `packages/db/src/database.ts`, `packages/db/src/index.ts`, `ARCHITECTURE.md`

## Definition of Done

- [x] Integration test (real `arv_test`): two writes then a failure inside `transactional` leave no rows; without the failure both rows exist.
- [x] Integration test: a nested `transactional` joins the outer one.
- [x] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` clean

## Notes

- **Identical to resource-scheduling [T02](../../resource-scheduling/tasks/t02-unit-of-work-live.md)** (sad §11: whichever feature is built first implements it). If it has already merged, confirm the DoD holds and close this task.
- The transaction never wraps the Google call (sad §8 Transactions; Hyperdrive holds one connection per transaction).
