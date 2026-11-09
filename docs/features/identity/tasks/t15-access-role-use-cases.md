---
id: T15
title: "Implement the access-role use cases: compose, rename, delete with warning, pre-select and list permissions"
layer: "app"
deps: ["T10"]
acs: ["AC-09", "AC-10", "AC-11", "AC-13", "AC-14", "AC-16"]
files_hint: ["modules/identity/src/application/access-roles/", "modules/identity/src/application/list-permissions.ts", "modules/identity/src/application/access-roles.test.ts"]
owner: "TBD (backend lead)"
estimate: "L"
status: "done"
---

# T15 — Implement the access-role use cases: compose, rename, delete with warning, pre-select and list permissions

> Layer `app` · estimate L · blocked by T10 · ACs: AC-09, AC-10, AC-11, AC-13, AC-14, AC-16 ([PRD §5](../PRD.md))

## Why

Admins compose roles from declared permissions, and retired ones are flagged ([sad §6](../sad.md) Flows 6, 7, 9, 10; [ADR-0004](../adr/0004-declare-permissions-in-module-code-and-collect-them-in-the-host.md); [api-sync-report.md](../contracts/api-sync-report.md) D-1 (c)(d)).

## What

- All guarded by `requirePermission('identity:manage-access')`.
- `listAccessRoles`: each with permissions (declared labels, or `retired: true` with the key), holder count and pre-selected flag (AC-16).
- `createAccessRole` / `updateAccessRole`: name key unique (AC-10); only declared keys can be added, an existing retired key may be kept (AC-16, D-1 d); removing manage access is guarded (AC-14).
- `deleteAccessRole(id, confirm)`: without `confirm`, returns the warning (holder count, whether pre-selected); with it, deletes inside the last-admin guard (AC-11, AC-14).
- `setPreselectedAccessRole(id | null)` (AC-13). `listPermissions` returns the catalog.

Files: `modules/identity/src/application/access-roles/`, `modules/identity/src/application/list-permissions.ts`, `modules/identity/src/application/access-roles.test.ts`

## Definition of Done

- [ ] Unit tests (fakes) for each AC listed, including: deleting the pre-selected role clears the mark (AC-11), and a re-declared key is granted again and loses its flag (AC-16).
- [ ] Unit test: deleting «Admin», or removing manage access from it, while it's the only source of admins → `LastAdminRequired` (AC-14).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- Check the warn-then-confirm shape against the delete operation in openapi.yaml before you start (it doesn't use `ConfirmationRequired` unless the contract says so).
