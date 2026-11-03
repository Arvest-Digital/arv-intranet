---
id: T05
title: "Add identity test fixtures to @arv/db/testing"
layer: "tests"
deps: ["T04"]
acs: ["AC-14", "AC-20"]
files_hint: ["packages/db/src/testing/seed.ts", "packages/db/src/testing/index.ts", "packages/db/src/testing/reset.ts"]
owner: "TBD (backend lead)"
estimate: "S"
status: "todo"
---

# T05 — Add identity test fixtures to @arv/db/testing

> Layer `tests` · estimate S · blocked by T04 · ACs: AC-14, AC-20 ([PRD §5](../PRD.md))

## Why

Repository, integration and e2e tests seed users, roles, assignments and sessions in raw SQL ([data-model.md](../data-model.md) «Test fixtures»).

## What

- `makeUser` default email → `user-<n>@example.test`. Tests use `COMPANY_EMAIL_DOMAIN=example.test`.
- `makeAccessRole` / `seedAccessRoles` (+ grants), `seedUserAccessRoles`, `makeSession` / `seedSessions` (returns the raw token; `expiresAt` can be back-dated), `seedAdmin` (user + «Admin» granting `identity:manage-access` + assignment).
- `reset` truncates the new tables.

Files: `packages/db/src/testing/seed.ts`, `packages/db/src/testing/index.ts`, `packages/db/src/testing/reset.ts`

## Definition of Done

- [ ] Integration test: `seedAdmin` + `seedSessions` produce rows the T09 resolve query can read (smoke-tested with raw SQL here).
- [ ] PII guard: no real domain or name in any default.
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` clean

## Notes

- Raw SQL only: `@arv/db` can't import module tables.
