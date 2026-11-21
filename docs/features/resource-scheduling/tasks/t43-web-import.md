---
id: T43
title: "Build the import upload, preview and confirm screen"
layer: "ui"
deps: ["T35"]
acs: ["AC-30", "AC-31", "AC-32", "AC-33"]
files_hint: ["apps/web/app/features/scheduling/routes/import*", "apps/web/app/features/scheduling/components/import-*"
owner: "TBD (frontend lead)"
estimate: "M"
status: "done"
---

# T43 — Build the import upload, preview and confirm screen

> Layer `ui` · estimate M · blocked by [T35](./t35-import-commit.md) · ACs: AC-30, AC-31, AC-32, AC-33

## Why

US-11 (flow 13, [sad §6](../sad.md)); confirming re-uploads the file ([sad §8](../sad.md) Warn-then-confirm).

## What

- Upload → preview (counts, incomplete records, overbooked resource-weeks, or problem rows) → confirm re-submits the same file with `confirm: true`; one-time state; missing-permissions state.
- Own page `/import` with its own «Import» item in the main navigation, shown only to actors holding all three permissions (permission check only — the app shell does not fetch the import status). Not under People and no entry points on the board. After completion (`ImportStatus.completed`) the page shows the run summary from `ImportStatus.run` instead of the upload (AC-32). Code stays in the `scheduling` web feature. Design: Claude Design canvas, page V2, «Import · …».
- Compose `app/shared/ui` primitives (table, dialog, select, dropdown-menu, input, button) and theme tokens; no new design system ([ADR-0002](../adr/0002-render-board-ssr-with-week-window-in-url.md)). Add a shadcn component via `pnpm ui:add` only if none fits.

Files: `apps/web/app/features/scheduling/routes/import*`, `apps/web/app/features/scheduling/components/import-*`

## Definition of Done

- [x] Route/component tests: problem rows listed (AC-31), confirm resubmits the file (AC-30), already-imported state (AC-32), missing permissions named (AC-33), «Import» nav item shown only with all three permissions, completed state shows the run summary.
- [x] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- **Blocked until the PM supplies the real spreadsheet sample** (PRD §8; sad §11 High risk; sync report D-6). Whether a parser package may be added is an open Tech Lead decision (sad §11) — ask before adding one.
- Built on T34/T35's CSV parser: the web only uploads the file, so it needs no parser package. The drop zone says «CSV, up to 5 MB» (the api's `MAX_IMPORT_BYTES`) where the design says «XLSX or CSV, up to 10 MB»; this changes if the real sample needs XLSX.
- `/import` loads `GET /scheduling/import`: a 403 names the missing permissions (AC-33); `completed` shows the run's summary instead of the upload (AC-32). The page's own action forwards the multipart upload to `POST /scheduling/import`. The file stays in the browser between «Preview» and «Import everything», which sends it again with `confirm=true` (sad §8).
- The preview shows only what `ImportPreview` carries: four counts and the overbooked resource-weeks as Resource / Week / Over. The design's capacity and allocated columns, team, project-type and leave breakdowns, and incomplete-record names aren't in the contract. Problem rows show Row / Problem (the reason) / Details (the api's message) instead of the design's Column.
- «Import» sits in the main nav after «People» and shows only with all three permissions (`canImport` in `identity/gate.ts`, permission check only).

