---
id: T35
title: "Implement the one-time import commit and its endpoints"
layer: "app"
deps: ["T29", "T34"]
acs: ["AC-30", "AC-32", "AC-33"]
files_hint: ["modules/scheduling/src/application/import-commit.ts", "modules/scheduling/src/http/routes.ts", "packages/contracts/src/scheduling/", "apps/api/test/integration/scheduling/"]
owner: "TBD (backend lead)"
estimate: "M"
status: "done"
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

- [x] Api integration tests: unconfirmed upload → 409 `ConfirmationRequired` with the preview; confirmed → everything created; second import → refused with the one-time message; a failing row mid-commit leaves nothing (`apps/api/test/integration/scheduling/import.test.ts`).
- [x] Bodies validate against the OpenAPI examples (`packages/contracts/src/scheduling/imports.test.ts`).
- [x] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- Built on T34's assumed CSV format (see the T34 notes); revisit with the PM's sample (PRD §8, D-6). The endpoint takes any file part, so only the reader in `domain/import-rows.ts` changes.
- The use case takes the upload, not its text: permissions (AC-33) and the one-time check (AC-32) run before the file is read; files over 5 MB are refused unread (`ImportFileInvalid` → `platform.validation_failed`).
- The confirmed commit re-reads the import run and re-plans inside the unit of work, then calls `OrgApi.importRecords`, `ProjectsApi.importProjects`, `AllocationRepository.insertMany`, `AllocationHistoryRepository.appendMany` (`imported` entries) and `ImportRunRepository.insert`. The two bulk methods are new: batches of 1,000 rows, allocation ids drawn up front with `uuidv7()` so segment rows never depend on RETURNING order. 2,500 allocations insert in a handful of statements instead of ~7,500 round trips.
- `ImportRunRepository.exists` became `findCompleted` (the AC-32 refusal carries `completedAt`; `getImportStatus` returns the run); `insert` returns the stored run.
- AC-33's refusal is the shared `Refused` (403 `Forbidden`, `scheduling.missing_permission`, `details.missingPermissions` lists all missing) — the kernel's `PermissionDenied` names only one.
- The redaction matrix (T32) now covers `getImportStatus`.
