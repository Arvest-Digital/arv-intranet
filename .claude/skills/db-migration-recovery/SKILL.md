---
name: db-migration-recovery
description: Recover a broken or out-of-sync Drizzle migration in @arv/migrations. Use when `pnpm db:status` reports Changed, Skipped, Pending or Missing file, when `pnpm db:migrate` / drizzle-kit fails (locally or on Neon after a deploy), when drizzle-kit asks whether a table was renamed or moved, or when the migration journal/snapshots conflict after a merge.
allowed-tools: Bash(pnpm db:status*), Bash(pnpm db:generate), Bash(bash .claude/skills/db-migration-recovery/scripts/*), Read, Grep
---

# DB migration recovery

Pinned: drizzle-kit 0.31.11, drizzle-orm 0.45.4, Postgres 18 (`postgres:18-alpine` locally, Neon in prod).

Where things live:
- Migrations: `packages/migrations/drizzle/*.sql`, journal `drizzle/meta/_journal.json`, snapshots `drizzle/meta/NNNN_snapshot.json`.
- Config: `packages/migrations/drizzle.config.ts` (`schemaFilter`, `DATABASE_URL` fallback `postgres://arv:arv@localhost:5432/arv`).
- Status: `pnpm db:status` → `packages/migrations/scripts/status.ts`. Applied rows are `drizzle.__drizzle_migrations (hash = sha256 of the .sql, created_at = journal "when")`.
- `migrate` applies only files whose `when` is newer than the latest applied row, all pending ones in **one transaction**.

Rules that still apply: never edit an applied migration; `pnpm db:migrate` always needs the user's OK (it's on "ask"); on Neon use the **direct** URL, never Hyperdrive. Don't delete rows from `__drizzle_migrations` or drop schemas without asking.

## 0. Triage

- [ ] Run `bash .claude/skills/db-migration-recovery/scripts/diagnose.sh` (read-only).
- [ ] Confirm the target DB it prints. Local dev = `arv`, tests = `arv_test`, prod = Neon direct URL in `DATABASE_URL`.
- [ ] Pick the section by `db:status` / the error:

| Symptom | Section |
| --- | --- |
| `Pending` | A |
| `Changed` | B |
| `Skipped` | C |
| `Missing file` | D |
| `db:migrate` errored | E |
| drizzle-kit prompt "created or renamed…" / moved table | F |
| merge conflict in `_journal.json` / snapshots, two `NNNN_` with the same number | G |
| `Cannot connect to …` (exit 2) | Gotchas: docker / port |

## A. Pending

- [ ] Ask the user, then `pnpm db:migrate` (Neon: `DATABASE_URL=<direct url> pnpm db:migrate`).
- [ ] `pnpm db:status` → `Up to date`.

## B. Changed (applied file was edited)

- [ ] `git log -p -- packages/migrations/drizzle/<tag>.sql` — find the edit.
- [ ] Restore the applied version: `git checkout <commit-before-edit> -- packages/migrations/drizzle/<tag>.sql`.
- [ ] Put the intended change in the module's `infrastructure/schema.ts`, then `pnpm db:generate` → new migration.
- [ ] If the edit was only formatting/comments and the DB already matches, restoring the file is enough.
- [ ] `pnpm db:status` → `Ran` again.

## C. Skipped (older than the latest applied — `migrate` silently ignores it)

Typical cause: two branches generated migrations; yours has an older `when` than one already applied from main.

- [ ] If the skipped migration is yours and not applied anywhere shared: delete its `.sql`, snapshot and journal entry (see G), `pnpm db:generate` again — new `when` = now.
- [ ] Otherwise (already applied elsewhere, e.g. Neon): ask before touching the journal. Option: bump its `when` in `_journal.json` above the latest applied, keeping entries in `idx` order.
- [ ] Check the migration doesn't conflict with what ran after it (same tables/columns).
- [ ] `pnpm db:status` → `Pending`, then section A.

## D. Missing file (applied in DB, not in `drizzle/`)

- [ ] `git log --all --diff-filter=D --name-only -- packages/migrations/drizzle` and check other branches (`git log --all -- packages/migrations/drizzle`).
- [ ] Usually the DB was migrated from another branch: switch/rebase onto it or restore the file + snapshot + journal entry from that branch.
- [ ] Local DB only and nothing worth keeping? Ask, then recreate it: `docker compose down -v && pnpm dev` (both on "ask"; wipes `arv` and `arv_test`).
- [ ] Never delete the `__drizzle_migrations` row blindly — the schema change it recorded is still in the DB.

## E. `db:migrate` failed half-way

- [ ] Read the Postgres error (relation/column/type, line in the `.sql`).
- [ ] All pending migrations run in one transaction, so DDL is rolled back: `pnpm db:status` should still show them `Pending`. Verify, don't assume (statements that can't run in a transaction, e.g. `CREATE INDEX CONCURRENTLY`, break this).
- [ ] Fix the **unapplied** file (allowed — it never ran), or fix `schema.ts` and regenerate it (G steps).
- [ ] Data-dependent failure (e.g. `NOT NULL` on rows with nulls, duplicate on new unique index)? Add a backfill/cleanup statement before the constraint in the same migration.
- [ ] Rerun `pnpm db:migrate` (ask), then `pnpm db:status`.

## F. drizzle-kit rename/move prompt

drizzle-kit can't express `SET SCHEMA` or certain renames; answering "create" drops data.

- [ ] Cancel the prompt (Ctrl+C) — nothing is written.
- [ ] Write the migration by hand, like `0001_identity_schema.sql`:
  ```sql
  CREATE SCHEMA "identity";
  --> statement-breakpoint
  ALTER TABLE "public"."users" SET SCHEMA "identity";
  ```
  (renames: `ALTER TABLE … RENAME TO …`, `ALTER TABLE … RENAME COLUMN … TO …`). Separate statements with `--> statement-breakpoint`.
- [ ] Add the journal entry (next `idx`, `when` = `Date.now()`, `tag` = file name) and a snapshot `NNNN_snapshot.json`: copy the previous one, set new `id`, `prevId` = previous `id`, and edit it to the target state.
- [ ] `pnpm db:generate` must print `No schema changes, nothing to migrate`. If it generates something, the snapshot is wrong — delete the generated file and fix the snapshot.
- [ ] `pnpm db:migrate` (ask), `pnpm db:status`.

## G. Journal / snapshot conflict after merge

- [ ] Keep main's migrations, journal entries and snapshots exactly as they are (`git checkout origin/main -- packages/migrations/drizzle`).
- [ ] Drop your branch's generated migration: its `.sql`, `meta/NNNN_snapshot.json` and journal entry.
- [ ] If your local DB already applied it, roll that change back by hand or recreate the local DB (ask).
- [ ] `pnpm db:generate` — regenerates your change on top of main with the next number and a fresh `when`.
- [ ] `diagnose.sh` journal check passes (increasing `when`, file + snapshot per tag).

## Finish

- [ ] `pnpm db:status` exits 0 (`Up to date`).
- [ ] `pnpm db:generate` → `No schema changes, nothing to migrate`.
- [ ] `pnpm test:integration` (migrates `arv_test` via `migrateDatabase`).
- [ ] Commit `.sql` + `meta/` together on a feature branch: `fix(migrations): ...`.

## Gotchas

- `function uuidv7() does not exist` → the DB is older than Postgres 18 (old docker volume or a wrong Neon project). Check `select version()`.
- New module tables not generated → its schema name is missing from `schemaFilter` in `drizzle.config.ts`; drizzle-kit ignores it silently.
- `modules/_template` (any folder starting with `_`) is skipped by the config on purpose.
- Hyperdrive connection strings can't be used for migrations; use Neon's direct (non-pooled) URL.
- `created_at` in `__drizzle_migrations` is the journal `when`, not the apply time — so `migrate` reports success while a Skipped file never runs. Only `db:status` shows it.
- `arv_test` is a separate DB (`docker/init.sql`, created only on a fresh volume). Integration tests migrate it themselves; `DATABASE_URL=postgres://arv:arv@localhost:5432/arv_test pnpm db:status` to inspect it.
- `.claude/settings.json` puts `Edit(packages/db/drizzle/**)` on ask, but migrations live in `packages/migrations/drizzle` — editing them is **not** gated, so be deliberate.
- `Cannot connect` / `ECONNREFUSED 5432` → `docker compose up -d postgres`. Port in use → a local (Homebrew) Postgres owns 5432; stop it or you're talking to the wrong server.
- Biome ignores `drizzle/meta`; format JSON there by hand if you edit it.
