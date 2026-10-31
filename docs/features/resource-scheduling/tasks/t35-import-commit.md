---
id: T35
title: "Implement the one-time import commit and its endpoints"
layer: "app"
deps: ["T29", "T34"]
acs: ["AC-30", "AC-32", "AC-33"]
files_hint: ["modules/scheduling/src/application/import-commit.ts", "modules/scheduling/src/http/routes.ts", "packages/contracts/src/scheduling/", "apps/api/test/integration/scheduling/"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T35 — Implement the one-time import commit and its endpoints

> Layer `app` · estimate M · blocked by [T29](./t29-scheduling-http-writes.md), [T34](./t34-import-preview.md) · ACs: AC-30, AC-32, AC-33

## Why

`getImportStatus`, `importSpreadsheet` of [openapi.yaml](../contracts/openapi.yaml); one-time rule ([PRD §5](../PRD.md) AC-32; `import_runs` unique in [data-model.md](../data-model.md)).

## What

- Commit re-parses the re-uploaded file (never stored), recomputes the preview, and in one UoW calls the T33 commands, creates allocations with `imported` history, inserts `import_runs`.
- Routes; second import refused (AC-32).

Files: `modules/scheduling/src/application/import-commit.ts`, `modules/scheduling/src/http/routes.ts`, `packages/contracts/src/scheduling/`, `apps/api/test/integration/scheduling/`

## Definition of Done

- [ ] Api integration tests: unconfirmed upload → 409 `ConfirmationRequired` with the preview; confirmed → everything created; second import → refused with the one-time message; a failing row mid-commit leaves nothing.
- [ ] Bodies validate against the OpenAPI examples.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- **Blocked until the PM supplies the real spreadsheet sample** (PRD §8; sad §11 High risk; sync report D-6). Whether a parser package may be added is an open Tech Lead decision (sad §11) — ask before adding one.
