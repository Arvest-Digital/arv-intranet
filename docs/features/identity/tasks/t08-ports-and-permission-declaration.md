---
id: T08
title: "Declare identity:manage-access and define identity's application ports with in-memory fakes"
layer: "app"
deps: ["T06", "T07"]
acs: ["AC-08", "AC-16", "AC-18", "AC-19"]
files_hint: ["modules/identity/src/permissions.ts", "modules/identity/src/application/ports.ts", "modules/identity/src/application/testing.ts", "modules/identity/src/index.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "done"
---

# T08 — Declare identity:manage-access and define identity's application ports with in-memory fakes

> Layer `app` · estimate M · blocked by T06, T07 · ACs: AC-08, AC-16, AC-18, AC-19 ([PRD §5](../PRD.md))

## Why

Permissions are declared in module code and collected by the host ([ADR-0004](../adr/0004-declare-permissions-in-module-code-and-collect-them-in-the-host.md); [sad §8](../sad.md) Permission declaration). The use cases depend on ports, never on Drizzle ([sad §5](../sad.md) internal decomposition).

## What

- `permissions.ts`: `identityPermissions: PermissionDeclaration[]` with `identity:manage-access` (plain-language name, one-sentence description, feature «Access»), exported from the module root.
- `ports.ts`: `UserRepository` (extended), `SessionRepository`, `AccessRoleRepository`, `GoogleSignIn`, `PermissionCatalog` (all declarations + `isDeclared`), `IdentityConfig` (company domain, first-admin email, sign-in return URL, Google client id).
- `application/testing.ts`: in-memory fakes of every port, used by the use-case unit tests in T12–T15.

Files: `modules/identity/src/permissions.ts`, `modules/identity/src/application/ports.ts`, `modules/identity/src/application/testing.ts`, `modules/identity/src/index.ts`

## Definition of Done

- [ ] Unit test: every declaration's key matches `<module>:<kebab-action>`, and `identity:manage-access` is exported from `@arv/identity`.
- [ ] Unit test: the fake `PermissionCatalog` reports a key as undeclared once it's removed (AC-16, AC-18).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- **Open (PRD §8 Q1):** final plain-language labels for the seven launch permissions are still open. Use the glossary wording by default, and swap it in before launch without a code change elsewhere.
- Scheduling's six permissions are declared by scheduling's own `permissions.ts` when that module exists. Identity never imports a feature module.
