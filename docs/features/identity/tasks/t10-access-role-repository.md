---
id: T10
title: "Implement the Drizzle access-role repository with the manage-access holder queries"
layer: "infra"
deps: ["T03", "T04", "T05", "T08"]
acs: ["AC-03", "AC-09", "AC-10", "AC-11", "AC-13", "AC-14", "AC-15"]
files_hint: ["modules/identity/src/infrastructure/drizzle-access-role-repository.ts", "apps/api/test/integration/identity/access-role-repository.test.ts"]
owner: "TBD (backend lead)"
estimate: "L"
status: "todo"
---

# T10 — Implement the Drizzle access-role repository with the manage-access holder queries

> Layer `infra` · estimate L · blocked by T03, T04, T05, T08 · ACs: AC-03, AC-09, AC-10, AC-11, AC-13, AC-14, AC-15 ([PRD §5](../PRD.md))

## Why

Roles are saved with their keys as one aggregate. The last-admin and first-admin rules count holders of `identity:manage-access` ([data-model.md](../data-model.md) Aggregates, Indexes; [sad §6](../sad.md) Flows 6–10).

## What

- List (with keys and holder count), get, find by name key, insert/update name and the key set (replace), delete.
- `setPreselected(id | null)` as the single `UPDATE … SET is_preselected = (id = $1)` statement; `getPreselected`.
- `countManageAccessHolders()`, `listAdmins()` (name + email, for the «not set up yet» screen), `ensureAdminRole()` (find «Admin» by name key or create it, then add `identity:manage-access`) for the bootstrap.
- A unique violation on the name key becomes `AccessRoleNameTaken`.

Files: `modules/identity/src/infrastructure/drizzle-access-role-repository.ts`, `apps/api/test/integration/identity/access-role-repository.test.ts`

## Definition of Done

- [ ] Integration tests: «planner » after «Planner» → `AccessRoleNameTaken` (AC-10); setting a second pre-selected role clears the first (AC-13).
- [ ] Integration tests: holder count after deleting a role is 0 (AC-11); `countManageAccessHolders` counts distinct users across two admin roles (AC-14); `listAdmins` returns name and email only (AC-03).
- [ ] Integration test: `ensureAdminRole` reuses an existing «admin» role and adds manage access (AC-15).
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` clean

## Notes

- Holder count of declared keys only: the caller passes the declared manage-access key; a retired grant never counts.
