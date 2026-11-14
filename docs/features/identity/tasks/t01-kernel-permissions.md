---
id: T01
title: "Add Permission, requirePermission and the permission set on Actor.User in the kernel"
layer: "domain"
deps: []
acs: ["AC-17", "AC-18", "AC-19"]
files_hint: ["packages/kernel/src/actor.ts", "packages/kernel/src/permission.ts", "packages/kernel/src/index.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "done"
---

# T01 — Add Permission, requirePermission and the permission set on Actor.User in the kernel

> Layer `domain` · estimate M · blocked by — · ACs: AC-17, AC-18, AC-19 ([PRD §5](../PRD.md))

## Why

Every feature checks access through one shared check over a per-request actor ([ADR-0005](../adr/0005-check-permissions-with-one-kernel-require-permission-over-a-per-request-actor.md); [sad §4](../sad.md) choice 4; [sad §8](../sad.md) Authorization). Implements resource-scheduling's ADR-0004.

## What

- `Permission` — branded `<module>:<kebab-action>` string; `PermissionDeclaration { key, name, description, feature }` ([ADR-0004](../adr/0004-declare-permissions-in-module-code-and-collect-them-in-the-host.md) shape).
- `Actor.User` gains `permissions: ReadonlySet<Permission>`; existing builders of `Actor.User` pass an empty set (deny by default).
- `requirePermission(permission)` over `CurrentActor`: `Anonymous` → `Unauthenticated`; missing key → `PermissionDenied { permission }`; otherwise succeeds.
- Tagged errors `PermissionDenied` and `Unauthenticated` (optional `reason: 'access-removed'` for AC-07) in `permission.ts`. Kernel still depends on `effect` only.

Files: `packages/kernel/src/actor.ts`, `packages/kernel/src/permission.ts`, `packages/kernel/src/index.ts`

## Definition of Done

- [x] Unit tests: anonymous actor → `Unauthenticated`; user without the key → `PermissionDenied` naming it; user with it → success.
- [x] Unit test (AC-19): a user holding only `identity:manage-access` is denied `scheduling:edit-allocations`.
- [x] Unit test (AC-18): a key nobody holds is refused for every actor, an admin included.
- [x] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- **Shared with resource-scheduling [T01](../../resource-scheduling/tasks/t01-permissions-on-actor.md).** sad §11 says identity's kernel changes land first. If scheduling T01 has already merged, this task only adds what's missing (`requirePermission`, the errors, `PermissionDeclaration`). Scheduling's stub `PermissionSource` is replaced in T20.
