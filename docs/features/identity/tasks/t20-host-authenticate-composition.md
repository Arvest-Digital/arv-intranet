---
id: T20
title: "Wire authenticate, the permission catalog and identity config in the api host"
layer: "wiring"
deps: ["T12", "T17"]
acs: ["AC-03", "AC-07", "AC-18", "AC-20"]
files_hint: ["apps/api/src/middleware/authenticate.ts", "apps/api/src/composition.ts", "apps/api/src/env.ts", "apps/api/src/index.ts", "apps/api/wrangler.jsonc", "apps/api/.dev.vars.example", "apps/api/src/middleware/permission-source.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T20 — Wire authenticate, the permission catalog and identity config in the api host

> Layer `wiring` · estimate M · blocked by T12, T17 · ACs: AC-03, AC-07, AC-18, AC-20 ([PRD §5](../PRD.md))

## Why

The host is the only place that knows every module ([ADR-0004](../adr/0004-declare-permissions-in-module-code-and-collect-them-in-the-host.md); [ADR-0005](../adr/0005-check-permissions-with-one-kernel-require-permission-over-a-per-request-actor.md); [sad §8](../sad.md) Authentication; [sad §7](../sad.md) configuration).

## What

- `authenticate`: public allow-list (`/health`, sign-in begin and complete). Every other route needs a valid session: anonymous → 401, revoked → 401 `access-removed`. Logs `accessCheckMs` and sets `Server-Timing: accessCheck;dur=…`.
- `composition.ts`: `PermissionCatalog` from every module's declarations (identity's today; scheduling's when it lands), `IdentityConfig` from env.
- `env.ts` and `wrangler.jsonc`: secrets `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`; vars `COMPANY_EMAIL_DOMAIN`, `FIRST_ADMIN_EMAIL`, `SIGN_IN_RETURN_URL`.
- Remove scheduling's stub `PermissionSource` if T01 of resource-scheduling has added it.

Files: `apps/api/src/middleware/authenticate.ts`, `apps/api/src/composition.ts`, `apps/api/src/env.ts`, `apps/api/src/index.ts`, `apps/api/wrangler.jsonc`, `apps/api/.dev.vars.example`, `apps/api/src/middleware/permission-source.ts`

## Definition of Done

- [ ] Integration test: every non-public route answers 401 to an anonymous request (route list taken from the app, not hand-written).
- [ ] Integration test: a revoked session → 401 with reason `access-removed` (AC-07); the `Server-Timing` header carries `accessCheck`.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` clean

## Notes

- Identity queries use only the uncached Hyperdrive main config.
