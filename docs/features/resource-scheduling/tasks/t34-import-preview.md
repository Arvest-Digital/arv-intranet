---
id: T34
title: "Implement import parsing, validation and the preview"
layer: "app"
deps: ["T23", "T33"]
acs: ["AC-30", "AC-31", "AC-33"]
files_hint: ["modules/scheduling/src/domain/import-rows.ts", "modules/scheduling/src/application/import-preview.ts"]
owner: "TBD (backend lead)"
estimate: "L"
status: "todo"
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

- [ ] Unit tests per problem-row reason (AC-31) and the counts of a clean file (AC-30); AC-33 names missing permissions.
- [ ] Preview of a 2,000-row fixture completes in < 10 s locally (QS-8 smoke).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- **Blocked until the PM supplies the real spreadsheet sample** (PRD §8; sad §11 High risk; sync report D-6). Whether a parser package may be added is an open Tech Lead decision (sad §11) — ask before adding one.
