---
id: T38
title: "Build the project list, create and close-with-preview screens"
layer: "ui"
deps: ["T17"]
acs: ["AC-23", "AC-24", "AC-25", "AC-26", "AC-11"]
files_hint: ["apps/web/app/features/projects/"]
owner: "TBD (frontend lead)"
estimate: "M"
status: "todo"
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

- [ ] Route/component tests: AC-24 message, close preview lists trims and removals and resubmits with `confirm: true` (AC-25), forbidden state (AC-26).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
