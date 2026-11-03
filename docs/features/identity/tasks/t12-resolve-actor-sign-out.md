---
id: T12
title: "Implement resolveActor and sign-out, and wire identity's adapters in the module layer"
layer: "app"
deps: ["T09", "T10", "T11"]
acs: ["AC-07", "AC-17", "AC-18", "AC-19", "AC-20"]
files_hint: ["modules/identity/src/application/resolve-actor.ts", "modules/identity/src/application/sign-out.ts", "modules/identity/src/application/identity-api.ts", "modules/identity/src/layer.ts", "modules/identity/src/application/resolve-actor.test.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T12 — Implement resolveActor and sign-out, and wire identity's adapters in the module layer

> Layer `app` · estimate M · blocked by T09, T10, T11 · ACs: AC-07, AC-17, AC-18, AC-19, AC-20 ([PRD §5](../PRD.md))

## Why

Permissions are resolved on every request, never cached, and fail closed ([ADR-0005](../adr/0005-check-permissions-with-one-kernel-require-permission-over-a-per-request-actor.md); [sad §6](../sad.md) Critical flow 2, Flow 11; [sad §10](../sad.md) QG-1).

## What

- `IdentityApi.resolveActor(token)`: none, unknown or expired → `Anonymous`; revoked → fails `Unauthenticated { reason: 'access-removed' }`; active → `Actor.User { id, permissions = granted ∩ catalog }`.
- A repository failure is a defect and never turns into `Anonymous` (fail closed).
- `signOut(token)` deletes that session only (AC-20).
- `layer.ts` wires the Drizzle repositories (T09, T10) and the Google adapter (T11). `PermissionCatalog` and `IdentityConfig` stay requirements, provided by the host in T20.

Files: `modules/identity/src/application/resolve-actor.ts`, `modules/identity/src/application/sign-out.ts`, `modules/identity/src/application/identity-api.ts`, `modules/identity/src/layer.ts`, `modules/identity/src/application/resolve-actor.test.ts`

## Definition of Done

- [ ] Unit tests (fakes): a retired key held by a role is not in the actor's set (AC-16/AC-18); after a fake role change the next resolve reflects it (AC-17); manage access alone yields exactly `{identity:manage-access}` (AC-19).
- [ ] Unit test: a failing `SessionRepository` produces a defect, not `Anonymous` (QG-1 fail closed).
- [ ] Unit test: sign-out removes one session and leaves the user's other session valid (AC-20).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- No cache of any kind ([ADR-0005](../adr/0005-check-permissions-with-one-kernel-require-permission-over-a-per-request-actor.md)).
