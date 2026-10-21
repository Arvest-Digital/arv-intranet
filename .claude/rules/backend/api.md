---
paths:
  - "apps/api/**"
---
# API host

- `apps/api` is a host only: entry point, middleware (`src/middleware/`), composition (`src/composition.ts`). No business logic, no SQL, no domain types here.
- New module: add its Layer to `src/composition.ts` (dependency order) and mount its routes in `src/index.ts`, re-exporting its route type for web. Nothing else in the host changes.
- `AppServices` is derived from the composed Layer; don't maintain it by hand. A service missing from the composition is a 500 at run time, not a type error, so cover new routes with integration tests.
- Authentication isn't decided yet: `IdentityApi.resolveActor` returns an anonymous actor. Don't build features that rely on a real actor without asking.
- Integration tests live in `test/integration/<module>/`.
