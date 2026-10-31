---
id: T01
title: "Carry the permission set on Actor and resolve it per request"
layer: "wiring"
deps: []
acs: ["AC-14", "AC-03", "AC-12"]
files_hint: ["packages/kernel/src/actor.ts", "packages/kernel/src/ids.ts", "packages/kernel/src/today.ts", "packages/kernel/src/index.ts", "apps/api/src/middleware/authenticate.ts", "apps/api/src/middleware/permission-source.ts", "apps/api/src/env.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T01 — Carry the permission set on Actor and resolve it per request

> Layer `wiring` · estimate M · blocked by — · ACs: AC-14, AC-03, AC-12

## Why

Every use case checks named permissions resolved at the moment of the action ([PRD §5](../PRD.md) AC-14; [ADR-0004](../adr/0004-resolve-permissions-into-actor-per-request.md); [sad §8](../sad.md) Authorization, Dates). Cross-module IDs live in the kernel ([sad §8](../sad.md) ID strategy).

## What

- `Actor.User` gains `permissions: ReadonlySet<Permission>`; `Permission` is a branded `<module>:<name>` string with the six identifiers of sad §8 as constants.
- `EmployeeId` and `ProjectId` branded IDs beside `UserId` in `ids.ts`.
- `Today` service in the kernel: today's date in `COMPANY_TIME_ZONE` (`Europe/Kyiv`) built on Effect's `Clock`, so tests can fix it.
- Host: a `PermissionSource` port with a stub implementation (fixed grants per test user, configurable in tests); `authenticate` builds the Actor with identity + permissions on every request. `COMPANY_TIME_ZONE` added to `env.ts` / wrangler vars.

Files: `packages/kernel/src/actor.ts`, `packages/kernel/src/ids.ts`, `packages/kernel/src/today.ts`, `packages/kernel/src/index.ts`, `apps/api/src/middleware/authenticate.ts`, `apps/api/src/middleware/permission-source.ts`, `apps/api/src/env.ts`

## Definition of Done

- [ ] Unit tests: an Actor built by the middleware carries exactly the stub's grants for that user, and an anonymous request carries none (deny by default).
- [ ] Unit test: `Today` returns the Kyiv date for an instant just after midnight Kyiv (still the previous day in UTC).
- [ ] Existing identity tests still pass; `pnpm lint && pnpm typecheck` clean.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- Placement of `Today` in `@arv/kernel` follows sad §8 («read through a Clock port»); it depends only on `effect`. If the Tech Lead prefers it elsewhere, ask before moving (CLAUDE.md: code no module owns).
- The real roles/permissions source is out of scope — launch gate (sad §11).
