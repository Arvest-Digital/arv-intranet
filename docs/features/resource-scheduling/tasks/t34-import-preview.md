---
id: T34
title: "Implement import parsing, validation and the preview"
layer: "app"
deps: ["T23", "T33"]
acs: ["AC-30", "AC-31", "AC-33"]
files_hint: ["modules/scheduling/src/domain/import-rows.ts", "modules/scheduling/src/application/import-preview.ts"]
owner: "TBD (backend lead)"
estimate: "L"
status: "done"
---

# T34 — Implement import parsing, validation and the preview

> Layer `app` · estimate L · blocked by [T23](./t23-scheduling-allocation-commands.md), [T33](./t33-import-facade-commands.md) · ACs: AC-30, AC-31, AC-33

## Why

Flow 13 of [sad §6](../sad.md); rows checked with the manual-entry rules ([PRD §5](../PRD.md) AC-31).

## What

- Parse the spreadsheet into rows; flag empty hours, end before start, near-duplicate names (initials, case, spaces); run AC-09 / AC-13 / AC-20 rules; compute counts, incomplete records and overbooked resource-weeks; formula-like cells kept as text.
- Permission check: all three of edit-allocations, manage-employee-records, manage-projects; refusal names the missing ones (AC-33).

Files: `modules/scheduling/src/domain/import-rows.ts`, `modules/scheduling/src/application/import-preview.ts`

## Definition of Done

- [x] Unit tests per problem-row reason (AC-31) and the counts of a clean file (AC-30); AC-33 names missing permissions.
- [x] Preview of a 2,000-row fixture completes in < 10 s locally (QS-8 smoke) — ~150 ms on the in-memory fakes.
- [x] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- **Built on an assumed format; revisit when the PM supplies the real sample** (PRD §8; sad §11 High risk; sync report D-6). Decision 2026-11-19: CSV, one row per allocation, in-house RFC 4180 reader, no parser package (the Tech Lead decision in sad §11 stays open). The columns, header aliases and cell readers live in one place, `COLUMNS` and the readers at the top of `modules/scheduling/src/domain/import-rows.ts`, which documents the format. When the sample arrives, change those and the tests; the checks, preview and commit inputs should not need to change.
- Similar-name rule (AC-31), in `domain/similar-name.ts`: two different spellings are flagged when they match once case, spaces and dots are ignored, or when their words line up with initials standing for words (initials skipped on one side only, and at least one full word must match). Surrounding spaces never count as a different spelling (AC-24). A spelling equal to an existing employee record is flagged as well, because `importRecords` only creates records.
- Facade reads added for the preview: `OrgApi.allResources(window)` and `ProjectsApi.listOpenOn(date)`. `validateEmployeeTerms` is exported from `@arv/org`, so AC-20 rows are checked with org's own rules. No new module edges.
- Left for T35: the AC-32 already-imported check (needs `completedAt`), the routes, and mapping `ImportProblemRows` / `ImportFileInvalid` / `ImportPermissionsMissing` in the presenter. `planImport` returns the checked `records` / `projects` / `allocations` that the commit passes to the T33 commands.
