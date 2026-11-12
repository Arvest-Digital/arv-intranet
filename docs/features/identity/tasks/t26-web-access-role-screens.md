---
id: T26
title: "Build the access-role screens: compose, rename, delete with warning, pre-select and retired flags"
layer: "ui"
deps: ["T19", "T24"]
acs: ["AC-09", "AC-10", "AC-11", "AC-13", "AC-14", "AC-16"]
files_hint: ["apps/web/app/features/identity/routes/access-roles.tsx", "apps/web/app/features/identity/components/access-role-form.tsx", "apps/web/app/features/identity/components/permission-picker.tsx", "apps/web/app/features/identity/components/delete-role-dialog.tsx", "apps/web/app/features/identity/identity.server.ts", "apps/web/app/routes.ts"]
owner: "TBD (frontend lead)"
estimate: "L"
status: "done"
---

# T26 — Build the access-role screens: compose, rename, delete with warning, pre-select and retired flags

> Layer `ui` · estimate L · blocked by T19, T24 · ACs: AC-09, AC-10, AC-11, AC-13, AC-14, AC-16 ([PRD §5](../PRD.md))

## Why

[sad §6](../sad.md) Flows 6, 7, 9 and 10; PRD US-04 and US-07.

## What

- Role list with holder counts, pre-selected mark and a retired-permission flag that names the key (AC-16).
- Form with a permission picker grouped by feature, showing name and one-sentence description (AC-09). Retired keys are shown removable, never addable.
- Delete dialog shows the holder count and whether the role is pre-selected, then confirms (AC-11). Mark or clear pre-selected (AC-13).
- Reuse `Table`, `Dialog`, `Input`, `Button`.

Files: `apps/web/app/features/identity/routes/access-roles.tsx`, `apps/web/app/features/identity/components/access-role-form.tsx`, `apps/web/app/features/identity/components/permission-picker.tsx`, `apps/web/app/features/identity/components/delete-role-dialog.tsx`, `apps/web/app/features/identity/identity.server.ts`, `apps/web/app/routes.ts`

## Definition of Done

- [x] Component tests: a retired key renders flagged and isn't offered in the picker (AC-16); the delete warning shows the count and the pre-selected note (AC-11); the duplicate-name 409 shows inline (AC-10).
- [x] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- Same lane as T25.
