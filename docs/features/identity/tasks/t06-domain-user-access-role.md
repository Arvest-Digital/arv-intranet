---
id: T06
title: "Model company email, user name, access-role name key and retired permissions in the identity domain"
layer: "domain"
deps: ["T01"]
acs: ["AC-05", "AC-06", "AC-10", "AC-16", "AC-21"]
files_hint: ["modules/identity/src/domain/user.ts", "modules/identity/src/domain/access-role.ts", "modules/identity/src/domain/errors.ts", "modules/identity/src/domain/user.test.ts", "modules/identity/src/domain/access-role.test.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "done"
---

# T06 — Model company email, user name, access-role name key and retired permissions in the identity domain

> Layer `domain` · estimate M · blocked by T01 · ACs: AC-05, AC-06, AC-10, AC-16, AC-21 ([PRD §5](../PRD.md))

## Why

Normalisation and uniqueness rules live in the domain, not the DB ([sad §8](../sad.md) Normalisation; [data-model.md](../data-model.md) «Rules (app)»; [ADR-0004](../adr/0004-declare-permissions-in-module-code-and-collect-them-in-the-host.md) retired permissions).

## What

- `CompanyEmail`: trimmed, lower-cased, valid, ≤254 chars, on the configured domain; otherwise `NotCompanyAddress` (AC-05, AC-06). Email is immutable (AC-21).
- `UserName`: trimmed, non-empty, ≤200 (data-model TBD → 200). `AccessRoleName`: trimmed display form, ≤100, `nameKey = lower(trim)` (AC-10).
- Access-role grants split into active and retired keys against a set of declared keys. Adding an undeclared key is refused (`RetiredPermissionNotAssignable`), but keeping one is allowed (AC-16).
- Errors: `NotCompanyAddress`, `EmailTaken` (exists), `UserNotFound` (exists), `AccessRoleNameTaken`, `AccessRoleNotFound`, `RetiredPermissionNotAssignable`, `LastAdminRequired`.

Files: `modules/identity/src/domain/user.ts`, `modules/identity/src/domain/access-role.ts`, `modules/identity/src/domain/errors.ts`, `modules/identity/src/domain/user.test.ts`, `modules/identity/src/domain/access-role.test.ts`

## Definition of Done

- [ ] Unit tests: «Anna@» and « anna@ » normalise to the same email (AC-06); an other-domain or invalid address → `NotCompanyAddress` (AC-05).
- [ ] Unit tests: «Planner» and «planner » share a name key (AC-10); a role's retired keys are exactly those not in the declared set (AC-16).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- Domain imports only `@arv/kernel` (Biome-enforced).
