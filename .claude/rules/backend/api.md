---
paths:
  - "apps/api/**"
---
# API host

- `apps/api` is a host only: entry point, middleware (`src/middleware/`), composition (`src/composition.ts`). No business logic, no SQL, no domain types here.
- New module: add its Layer to `src/composition.ts` (dependency order) and mount its routes in `src/index.ts`, re-exporting its route type for web. Nothing else in the host changes.
- `AppServices` is derived from the composed Layer; don't maintain it by hand. A service missing from the composition is a 500 at run time, not a type error, so cover new routes with integration tests.
- `middleware/authenticate.ts` resolves the actor through `IdentityApi.resolveActor` on every request (no cache) and answers 401 to anonymous or revoked sessions on every route except `PUBLIC_ROUTES`. Use cases still check access with `requirePermission`; a new public route goes into `PUBLIC_ROUTES` deliberately.
- Module config comes from `Bindings` (`src/env.ts`), declared in `wrangler.jsonc` vars, `.dev.vars.example` (secrets) and the integration config's miniflare bindings.
- Integration tests live in `test/integration/<module>/`.
