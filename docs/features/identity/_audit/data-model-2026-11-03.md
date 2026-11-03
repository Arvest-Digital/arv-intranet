# Audit — data model, identity (2026-11-03)

Run: `/sdlc:generate-data-model identity` (mode: brownfield delta on the existing `identity` schema — new tables only). Size M (from PRD frontmatter; no `.size` file).

## Generated files

- [`data-model.md`](../data-model.md) — ER, 3 aggregates, 5 tables (1 existing, 4 new), 10 index rows with «Query it serves».
- Staged migrations — **not** in the live `packages/migrations/drizzle/` tree; `implement-tasks` promotes them (writes `schema.ts`, runs `pnpm db:generate`, diffs the result against these files; drizzle assigns the real `NNNN_` name at promote time):
  - `docs/features/identity/migrations/20261103120000_create_sessions.{up,down}.sql`
  - `docs/features/identity/migrations/20261103120001_create_access_roles.{up,down}.sql`
  - `docs/features/identity/migrations/20261103120002_create_user_access_roles.{up,down}.sql`

**Verified against real Postgres 18** (throwaway database `arv_dmcheck` in the local docker container, dropped afterwards; the dev `arv` DB was not touched): all three `.up.sql` applied on top of the current `identity.users`, then applied a **second** time with no error (idempotent). Constraint behaviour: `'planner '` vs `'Planner'` → `access_roles_name_key_unique` violation (AC-10); a second pre-selected role → `access_roles_one_preselected_unique` violation (AC-13); deleting a user → assignments cascaded, revoked session kept with `user_id = NULL` (AC-07); deleting a role → grants cascaded (AC-11). The three `.down.sql` files in reverse order left only `users`.

## Rules bootstrap

**Skipped on purpose.** The skill would copy a baseline `.claude/rules/migrations.md`; this repo keeps its DB rules in `.claude/rules/backend/db.md`, and a previous run's bootstrapped file was deleted at the team's request (2026-10-30). No rules file was written.

## Convention source

`docs/architecture-map.md` is **absent**. The live tree, tool and rules were taken from `packages/migrations/drizzle.config.ts`, `ARCHITECTURE.md` §Data and `.claude/rules/backend/db.md` instead (same approach as resource-scheduling).

## Convention divergences (course default → what was applied)

| Course default | Applied here | Why |
|---|---|---|
| UUID v7 generated **app-side** | `UUID DEFAULT uuidv7()` in Postgres | Repo convention (ARCHITECTURE.md §Data, db.md, SAD §8). |
| Timestamp-named `.up.sql` / `.down.sql` in the live tree | Staged timestamped files are a **spec**; the live migration is drizzle-generated `NNNN_*.sql` from `schema.ts` | Hand-written files are invisible to drizzle's journal and break `db:status` / `db:generate`. |
| `.down.sql` reverses each migration | `.down.sql` is documentation only, not promoted | db.md: no down migrations; a rollback is a new forward migration. |
| `CREATE INDEX CONCURRENTLY` on existing tables | Not used (and not needed — no index on an existing table) | drizzle-kit runs all pending migrations in one transaction. |
| `VARCHAR(N)` for bounded strings | New tables use `VARCHAR(N)`; existing `identity.users.email` / `name` **stay `TEXT`** | Retyping an existing table is an expand → backfill → contract change for no functional gain; bounds (email ≤ 254, name TBD) live in the domain. Revisit only if the team wants schema-as-documentation on `users` too. |
| Seeds for bootstrap data (admin user / default org) | **No seed** | The first admin and the «Admin» role are created at runtime only while no user holds manage access (AC-15); a seed would bypass that rule. |

## Decisions made in this pass (inferred from PRD/SAD — confirm at review)

1. **Pre-selected mark → `access_roles.is_preselected` + partial unique index** (SAD §6 flag «needs a home holding at most one role»). Alternative rejected: a singleton `preselected_role` table — one more table and FK for the same guarantee; the flag also clears itself when the marked role is deleted (AC-11).
2. **Revoked sessions outlive the removed user** — `sessions.user_id` nullable, `ON DELETE SET NULL`, plus `revoked_reason` (SAD §5 «removal revokes, it does not silently delete»). Alternative rejected: delete the sessions with the user — the next request would then show a generic sign-in prompt instead of AC-07's «you no longer have access».
3. **Sign-out deletes the session row** (Flow 11 «remove this session»); only removal-from-the-access-list uses `revoked_reason`.
4. **Token hash as `VARCHAR(64)` hex** rather than `BYTEA` — simple to bind from Web Crypto output and to declare in drizzle.
5. **No `updated_at` / `version` anywhere** — the in-place edits (user name, role name, mark, revoke) have no «last changed» or concurrency requirement in the PRD.
6. **Composite PKs** on the two join tables (no surrogate `id`) — the PK doubles as the leading-column FK index for the hot-path lookups.

## Drift findings

**Schema-vs-source** (domain layer: `modules/identity/src/domain/user.ts`, `infrastructure/schema.ts`):
- `User { id, email, name, createdAt }` ↔ `identity.users (id, email, name, created_at)`: no `field-without-column`, `column-without-field`, type or nullability mismatch.
- `Session`, `AccessRole` and assignments have no domain code yet (planned in SAD §5) — expected, not drift. No `_drift/*.sql` proposals.

**Model-vs-spec** (PRD §4–§6.1, SAD §5–§8):
- Every SAD §5 table (`users, sessions, access_roles, access_role_permissions, user_access_roles`) has a table; no table lacks a PRD/SAD origin.
- PRD concepts deliberately **not** tables: the permission catalog (code, ADR-0004), first-admin address and domain (config), sign-in history / audit log (PRD §3, §6.1 non-goals).
- SAD §6 index hints (normalised email, role name key, token hash, holder count) are all covered.
- **SAD §6.4 ER stub is absent** — the SAD has no §6.4; relationships came from §5 and the flows' persist notes.

## Breaking changes decomposed

None. `identity.users` gets no ALTER; all changes are new tables.

## PII guard

- Migrations and the fixtures planned in `data-model.md` use `Test User <n>` / `user-<n>@example.test`.
- **Existing finding:** `packages/db/src/testing/seed.ts` `makeUser()` defaults to `user<n>@arvest.digital` — the real company domain. Recommend `implement-tasks` switches it to `user-<n>@example.test` and sets `COMPANY_EMAIL_DOMAIN=example.test` in test config (same finding as the resource-scheduling audit, still open).

## Self-check (4/4 pass)

- **Naming:** tables plural `snake_case`; files `<timestamp>_create_<entity>`.
- **down.sql reversibility:** every `CREATE TABLE` / `CREATE INDEX` has a matching `DROP` (verified by applying them).
- **FK indexes:** `sessions.user_id` → `idx_sessions_user_id`; `access_role_permissions.access_role_id` → PK leading column; `user_access_roles.user_id` → PK leading column; `user_access_roles.access_role_id` → `idx_user_access_roles_access_role_id`.
- **Forbidden features:** grep for `CHECK (`, `CREATE TRIGGER`, `DEFAULT '`, `CONCURRENTLY`, `updated_at`, `deleted_at` → no matches.

## Mermaid

`mmdc` and a project `mermaid` package are not installed, so the structural lint was used instead. It found no problems: 5 entities, every relationship's endpoints are declared, the cardinality glyphs are valid, and the keys are only `PK` / `FK` / `UK`.

## TBDs

- `data-model.md:92` — `users.name` max length (PRD gives none; propose 200 in domain validation).
- `data-model.md:116` — `access_roles.name` bound `VARCHAR(100)` is an architect's choice.
- `data-model.md:127` — `access_role_permissions.permission_key` bound `VARCHAR(100)`; confirm against the longest declared key at api-forge.
