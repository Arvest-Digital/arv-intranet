---
id: T19
title: "Expose the access-role, pre-selected-role and permission-catalog endpoints"
layer: "ports"
deps: ["T02", "T15", "T16"]
acs: ["AC-09", "AC-10", "AC-11", "AC-13", "AC-14", "AC-16"]
files_hint: ["modules/identity/src/http/access-role-routes.ts", "modules/identity/src/http/routes.ts", "modules/identity/src/http/presenter.ts", "apps/api/test/integration/identity/access-roles.test.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T19 — Expose the access-role, pre-selected-role and permission-catalog endpoints

> Layer `ports` · estimate M · blocked by T02, T15, T16 · ACs: AC-09, AC-10, AC-11, AC-13, AC-14, AC-16 ([PRD §5](../PRD.md))

## Why

[openapi.yaml](../contracts/openapi.yaml) `listAccessRoles`, `createAccessRole`, `getAccessRole`, `updateAccessRole`, `deleteAccessRole`, `setPreselectedAccessRole`, `listPermissions`.

## What

- Routes and presenter mapping per the contract. `AccessRoleNameTaken` → 409; adding a retired key → 400 or 409 per the contract.

Files: `modules/identity/src/http/access-role-routes.ts`, `modules/identity/src/http/routes.ts`, `modules/identity/src/http/presenter.ts`, `apps/api/test/integration/identity/access-roles.test.ts`

## Definition of Done

- [ ] Integration tests, one per AC listed. AC-16: with a test-only catalog that stops declaring a key, the role is flagged, the key can't be added, and re-declaring it clears the flag.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` clean

## Notes

- Same lane as T17 and T18.
