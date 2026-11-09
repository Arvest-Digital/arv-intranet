---
id: T14
title: "Implement the access-list use cases: list, add, rename, remove and assign access roles under the last-admin guard"
layer: "app"
deps: ["T09", "T10"]
acs: ["AC-04", "AC-05", "AC-06", "AC-07", "AC-08", "AC-12", "AC-14", "AC-21"]
files_hint: ["modules/identity/src/application/access-list/", "modules/identity/src/application/create-user.ts", "modules/identity/src/application/get-user.ts", "modules/identity/src/application/list-users.ts", "modules/identity/src/application/users.test.ts"]
owner: "TBD (backend lead)"
estimate: "L"
status: "done"
---

# T14 — Implement the access-list use cases: list, add, rename, remove and assign access roles under the last-admin guard

> Layer `app` · estimate L · blocked by T09, T10 · ACs: AC-04, AC-05, AC-06, AC-07, AC-08, AC-12, AC-14, AC-21 ([PRD §5](../PRD.md))

## Why

Admins keep the access list, and no single action may leave zero admins ([sad §6](../sad.md) Flows 4, 5, 8, Critical flow 3; [sad §5](../sad.md) last-admin guard).

## What

- Every use case starts with `requirePermission('identity:manage-access')` (AC-08). The scaffold's `create-user`, `get-user` and `list-users` are replaced.
- `addUser(email, name, roleIds)`: normalise and validate (AC-05, AC-06); unknown role → `AccessRoleNotFound`.
- `renameUser` keeps roles and sessions (AC-21).
- `removeUser`: one `UnitOfWork` revokes all sessions, deletes the user and asserts an admin remains (AC-07, AC-14).
- `setUserAccessRoles(userId, roleIds)`: one `UnitOfWork` with the last-admin assertion; returns the user's combined permissions as declarations (AC-12).

Files: `modules/identity/src/application/access-list/`, `modules/identity/src/application/create-user.ts`, `modules/identity/src/application/get-user.ts`, `modules/identity/src/application/list-users.ts`, `modules/identity/src/application/users.test.ts`

## Definition of Done

- [ ] Unit tests (fakes) for each AC listed, including: removing the only admin, or taking «Admin» from them, → `LastAdminRequired` with nothing changed (AC-14).
- [ ] Unit test: a caller without manage access is refused before any read (AC-08).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- The multi-target guard runs inside the transaction: apply, count, roll back on 0.
