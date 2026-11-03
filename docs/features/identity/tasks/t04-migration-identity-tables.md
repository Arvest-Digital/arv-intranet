---
id: T04
title: "Promote the staged identity migrations: sessions, access roles, grants and assignments"
layer: "migration"
deps: []
acs: ["AC-06", "AC-07", "AC-10", "AC-13", "AC-20"]
files_hint: ["docs/features/identity/migrations/20261103120000_create_sessions.up.sql", "docs/features/identity/migrations/20261103120000_create_sessions.down.sql", "docs/features/identity/migrations/20261103120001_create_access_roles.up.sql", "docs/features/identity/migrations/20261103120001_create_access_roles.down.sql", "docs/features/identity/migrations/20261103120002_create_user_access_roles.up.sql", "docs/features/identity/migrations/20261103120002_create_user_access_roles.down.sql", "modules/identity/src/infrastructure/schema.ts", "packages/migrations/drizzle/"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T04 — Promote the staged identity migrations: sessions, access roles, grants and assignments

> Layer `migration` · estimate M · blocked by — · ACs: AC-06, AC-07, AC-10, AC-13, AC-20 ([PRD §5](../PRD.md))

## Why

The four new tables and their indexes are designed in [data-model.md](../data-model.md) (ER, Indexes, Staged migrations) per [ADR-0003](../adr/0003-sign-in-with-google-oidc-and-server-side-sessions.md) and [ADR-0006](../adr/0006-keep-sign-in-sessions-and-access-roles-in-one-identity-module.md).

## What

- Add `sessions`, `access_roles`, `access_role_permissions` and `user_access_roles` to `modules/identity/src/infrastructure/schema.ts` exactly as described in data-model.md's «Promote-time note». That covers composite PKs, `onDelete: 'cascade' | 'set null'`, the `lower(btrim(name))` unique index and the partial unique `(true) WHERE is_preselected`.
- `pnpm db:generate` → one new `packages/migrations/drizzle/NNNN_*.sql`. Diff it against the three staged `.up.sql` files: index names and FK actions must match.
- `identity.users` is not changed. Staged `.down.sql` files are not promoted (drizzle has no down migrations), but they're checked by hand on a dev DB.

Files: `docs/features/identity/migrations/20261103120000_create_sessions.up.sql`, `docs/features/identity/migrations/20261103120000_create_sessions.down.sql`, `docs/features/identity/migrations/20261103120001_create_access_roles.up.sql`, `docs/features/identity/migrations/20261103120001_create_access_roles.down.sql`, `docs/features/identity/migrations/20261103120002_create_user_access_roles.up.sql`, `docs/features/identity/migrations/20261103120002_create_user_access_roles.down.sql`, `modules/identity/src/infrastructure/schema.ts`, `packages/migrations/drizzle/`

## Definition of Done

- [ ] Staged migrations promoted: the generated SQL matches the staged `.up.sql` (names, FK actions, partial and expression indexes); `pnpm db:migrate` applies on a clean DB and `pnpm db:status` is clean.
- [ ] The staged `.down.sql` files reverse the generated migration on a dev DB (manual check, noted in the PR).
- [ ] Integration test: «Planner» then «planner » violates the name-key unique; two pre-selected roles violate the partial unique; deleting a user nulls `sessions.user_id` and cascades `user_access_roles`.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` clean

## Notes

- Migration lane: serialized. Use the `db-migration-recovery` skill if drizzle-kit asks about renames or the journal conflicts with resource-scheduling's migrations.
