---
paths:
  - "packages/db/**"
  - "packages/migrations/**"
  - "modules/*/src/infrastructure/**"
---
# Database

- One database, one schema per module. Tables live in the module's `infrastructure/schema.ts` via `pgSchema('<module>')`. `@arv/db` defines no tables.
- No foreign keys, joins or queries across module schemas. Reference other modules' rows by ID; check them through the owner's facade.
- Run every query through `query()` from `@arv/db` and turn `DbError` into a defect (`Effect.orDie`). Don't call `db.transaction` in adapters; that will be `UnitOfWork`'s job.
- Drizzle uses `casing: 'snake_case'` (camelCase in TS); IDs use `uuidv7()` (requires Postgres 18).
- Migrations live in `@arv/migrations`. Never edit an applied migration; generate a new one (`pnpm db:generate`). `pnpm db:status` flags edits as "Changed". If drizzle-kit prompts about a rename/move, write the SQL by hand and keep the snapshot consistent (`pnpm db:generate` must then report no changes).
- `resetDatabase` discovers tables itself; nothing to register.
- `@arv/db/testing` seed helpers use raw SQL (they can't import module tables).
- Don't close DB connections explicitly (Hyperdrive guidance; causes "socket has been closed").
