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

## Table design

- The DB is dumb storage: only PK, `NOT NULL`, `UNIQUE`, FKs inside the module, indexes, and `DEFAULT now()` / `DEFAULT uuidv7()`. No `CHECK`, triggers, stored procedures or business defaults (`DEFAULT 'pending'`); enums, ranges and invariants live in the module's `domain/`.
- Tables are plural `snake_case` (`users`, `employee_records`).
- Audit columns: `created_at timestamptz NOT NULL DEFAULT now()` only. Add `updated_at` / `last_changed_*` / `version` only when a requirement needs them (e.g. «last changed by», optimistic concurrency), and say why in the data model.
- Hard delete. No `deleted_at` or status-as-delete; if history is required, keep it in a separate history table.
- `jsonb` only for opaque payloads (snapshots, settings); fields that are queried or validated get their own columns.
- One index per real query; no «just in case» indexes. Every FK column gets an index.

## Changing existing tables

- No down migrations: a rollback is a new forward migration. Keep schema changes additive so a Worker rollback never needs a schema rollback.
- New `NOT NULL` column on a table with data: add it nullable → backfill → set `NOT NULL`, each a separate migration and deploy.
- Rename, drop or retype a column: expand (add the new column, dual-write in app code) → backfill → contract (drop the old one); each phase is a separate PR and deploy, the drop ships only after no running code reads the old column.
- No `CREATE INDEX CONCURRENTLY`: `drizzle-kit migrate` runs all pending migrations in one transaction. On a large table, plan the index separately.
- Lookup seeds go in a custom migration (`drizzle-kit generate --custom`) with `INSERT … ON CONFLICT DO NOTHING`. Test fixtures go in `@arv/db/testing`, never in migrations; seeds and fixtures use no real-looking personal data (`Test User`, `user-<n>@example.test`).
- `@arv/db/testing` seed helpers use raw SQL (they can't import module tables).
- Don't close DB connections explicitly (Hyperdrive guidance; causes "socket has been closed").
