---
id: T38
title: "Build the project list, create and close-with-preview screens"
layer: "ui"
deps: ["T17"]
acs: ["AC-23", "AC-24", "AC-25", "AC-26", "AC-11"]
files_hint: ["apps/web/app/features/projects/"]
owner: "TBD (frontend lead)"
estimate: "M"
status: "done"
---

# T38 — Build the project list, create and close-with-preview screens

> Layer `ui` · estimate M · blocked by [T17](./t17-projects-http.md) · ACs: AC-23, AC-24, AC-25, AC-26, AC-11

## Why

US-08 over the projects contract; close preview per critical flow 2 ([sad §6](../sad.md)).

## What

- List by type, create (duplicate name message), close: date picker → preview dialog of trimmed / removed allocations → confirm.
- Compose `app/shared/ui` primitives (table, dialog, select, dropdown-menu, input, button) and theme tokens; no new design system ([ADR-0002](../adr/0002-render-board-ssr-with-week-window-in-url.md)). Add a shadcn component via `pnpm ui:add` only if none fits.

Files: `apps/web/app/features/projects/`

## Definition of Done

- [x] Route/component tests: AC-24 message, close preview lists trims and removals and resubmits with `confirm: true` (AC-25), forbidden state (AC-26) (`features/projects/routes/projects.test.ts`, `features/projects/components/{project-list,project-dialogs}.test.tsx`).
- [x] `pnpm lint && pnpm typecheck && pnpm test` clean (`check:modules` trips only on the git-ignored `modules/.omc/` tool folder when it exists)

## Notes

- Route `/projects` (`features/projects/routes/projects.tsx`); «Projects» shows in the top nav for holders of `projects:manage-projects`, `scheduling:view-whole-board` or `scheduling:edit-allocations` (the api's list readers). Matches the V2 design's Projects list, Project create, Project close and Forbidden boards using `app/shared/ui`.
- List: grouped by type, with type/status segmented filters and name search (client-side; the whole list is loaded). Status reads «Open», «Open · until <date>» or «Closed · <date>». The AC-11 rule is stated under the table.
- Left out of the design because the contract has no data or endpoint for them: the «People, next 12 weeks» column and «Rename».
- Close: date (not before today, checked in the browser and by the api) → «Review changes» sends without `confirm`; a 409 `closing_confirmation_required` shows the allocations that end on the close date and those removed, and «Close project» resends with `confirm: true`. With nothing to trim the first request closes directly.
- Without manage-projects the list is read-only; a refused list/create/close (403) shows the forbidden screen naming «manage projects» (AC-26).
