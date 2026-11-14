---
id: T09
title: "Implement the Drizzle user and session repositories with the one-query actor lookup"
layer: "infra"
deps: ["T03", "T04", "T05", "T08"]
acs: ["AC-06", "AC-07", "AC-12", "AC-20", "AC-21"]
files_hint: ["modules/identity/src/infrastructure/drizzle-user-repository.ts", "modules/identity/src/infrastructure/drizzle-session-repository.ts", "apps/api/test/integration/identity/user-session-repository.test.ts"]
owner: "TBD (backend lead)"
estimate: "L"
status: "done"
---

# T09 — Implement the Drizzle user and session repositories with the one-query actor lookup

> Layer `infra` · estimate L · blocked by T03, T04, T05, T08 · ACs: AC-06, AC-07, AC-12, AC-20, AC-21 ([PRD §5](../PRD.md))

## Why

The per-request lookup is one indexed query, session → user → access roles → granted keys (QG-2; [data-model.md](../data-model.md) «Per-request query»; [sad §6](../sad.md) Critical flow 2).

## What

- Users: find by normalised email, insert (with initial role ids), rename, delete, `setAccessRoles(userId, roleIds)` (replace the set). A unique violation becomes `EmailTaken`.
- Sessions: `create(hash, userId, expiresAt)`, `resolve(hash)` → `{ state, userId, grantedKeys }` in **one** round-trip, `deleteByHash`, `revokeAllForUser('access-removed')`, `purgeExpired()`.
- All queries go through `query()` so they join an open `UnitOfWork`. DB failures are defects (`Effect.orDie`).

Files: `modules/identity/src/infrastructure/drizzle-user-repository.ts`, `modules/identity/src/infrastructure/drizzle-session-repository.ts`, `apps/api/test/integration/identity/user-session-repository.test.ts`

## Definition of Done

- [ ] Integration tests: `resolve` returns the union of keys across several roles (AC-12); expired → `expired`; revoked → `revoked`; unknown hash → `unknown`.
- [ ] Integration test: «Anna@» after «anna@» → `EmailTaken` (AC-06); rename keeps assignments (AC-21); delete inside a transaction with `revokeAllForUser` leaves revoked rows with `user_id` NULL (AC-07).
- [ ] Integration test: `deleteByHash` removes only that session (AC-20).
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` clean

## Notes

- `modules/identity/src/layer.ts` is wired in T12, not here, to keep the lanes apart. Use the uncached Hyperdrive config only ([ADR-0005](../adr/0005-check-permissions-with-one-kernel-require-permission-over-a-per-request-actor.md)).
