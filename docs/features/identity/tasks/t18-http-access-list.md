---
id: T18
title: "Expose the access-list endpoints behind manage access"
layer: "ports"
deps: ["T02", "T14", "T16"]
acs: ["AC-04", "AC-05", "AC-06", "AC-07", "AC-08", "AC-12", "AC-14", "AC-21"]
files_hint: ["modules/identity/src/http/access-list-routes.ts", "modules/identity/src/http/routes.ts", "modules/identity/src/http/presenter.ts", "apps/api/test/integration/identity/users.test.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T18 — Expose the access-list endpoints behind manage access

> Layer `ports` · estimate M · blocked by T02, T14, T16 · ACs: AC-04, AC-05, AC-06, AC-07, AC-08, AC-12, AC-14, AC-21 ([PRD §5](../PRD.md))

## Why

[openapi.yaml](../contracts/openapi.yaml) `listUsers`, `createUser`, `getUser`, `renameUser`, `removeUser`, `setUserAccessRoles`. Closes the sad §11 brownfield risk (scaffold `/users` routes open to anonymous callers).

## What

- Replace the scaffold `/users` handlers with the contract's.
- Presenter: `EmailTaken` → 409; `NotCompanyAddress` → 400; `LastAdminRequired` → 409 `identity.last_admin_required`; not-found → 404.

Files: `modules/identity/src/http/access-list-routes.ts`, `modules/identity/src/http/routes.ts`, `modules/identity/src/http/presenter.ts`, `apps/api/test/integration/identity/users.test.ts`

## Definition of Done

- [ ] Integration tests, one per AC listed. AC-08: a non-admin gets 403 and no list data. AC-14: removing the last admin → 409 and the DB is unchanged.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` clean

## Notes

- Same lane as T17 and T19 (`routes.ts`, `presenter.ts`).
