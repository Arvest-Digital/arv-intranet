---
id: T43
title: "Build the import upload, preview and confirm screen"
layer: "ui"
deps: ["T35"]
acs: ["AC-30", "AC-31", "AC-32", "AC-33"]
files_hint: ["apps/web/app/features/scheduling/routes/import*", "apps/web/app/features/scheduling/components/import-*"]
owner: "TBD (frontend lead)"
estimate: "M"
status: "todo"
---

# T43 — Build the import upload, preview and confirm screen

> Layer `ui` · estimate M · blocked by [T35](./t35-import-commit.md) · ACs: AC-30, AC-31, AC-32, AC-33

## Why

US-11 (flow 13, [sad §6](../sad.md)); confirming re-uploads the file ([sad §8](../sad.md) Warn-then-confirm).

## What

- Upload → preview (counts, incomplete records, overbooked resource-weeks, or problem rows) → confirm re-submits the same file with `confirm: true`; one-time state; missing-permissions state.
- Compose `app/shared/ui` primitives (table, dialog, select, dropdown-menu, input, button) and theme tokens; no new design system ([ADR-0002](../adr/0002-render-board-ssr-with-week-window-in-url.md)). Add a shadcn component via `pnpm ui:add` only if none fits.

Files: `apps/web/app/features/scheduling/routes/import*`, `apps/web/app/features/scheduling/components/import-*`

## Definition of Done

- [ ] Route/component tests: problem rows listed (AC-31), confirm resubmits the file (AC-30), already-imported state (AC-32), missing permissions named (AC-33).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- **Blocked until the PM supplies the real spreadsheet sample** (PRD §8; sad §11 High risk; sync report D-6). Whether a parser package may be added is an open Tech Lead decision (sad §11) — ask before adding one.
