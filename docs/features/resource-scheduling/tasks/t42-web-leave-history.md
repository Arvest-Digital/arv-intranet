---
id: T42
title: "Build the leave dialog and the allocation history panel"
layer: "ui"
deps: ["T41"]
acs: ["AC-15", "AC-16", "AC-29"]
files_hint: ["apps/web/app/features/scheduling/components/leave-dialog*", "apps/web/app/features/scheduling/components/history-panel*"]
owner: "TBD (frontend lead)"
estimate: "M"
status: "todo"
---

# T42 — Build the leave dialog and the allocation history panel

> Layer `ui` · estimate M · blocked by [T41](./t41-web-allocation-dialog.md) · ACs: AC-15, AC-16, AC-29

## Why

US-04 and US-05 (flows 6 and 7, [sad §6](../sad.md)).

## What

- Leave dialog: leave type = leave-type project, whole days; leave-day conflict confirm.
- History panel: entries with who / when / before → after; «away» where redacted.
- Compose `app/shared/ui` primitives (table, dialog, select, dropdown-menu, input, button) and theme tokens; no new design system ([ADR-0002](../adr/0002-render-board-ssr-with-week-window-in-url.md)). Add a shadcn component via `pnpm ui:add` only if none fits.

Files: `apps/web/app/features/scheduling/components/leave-dialog*`, `apps/web/app/features/scheduling/components/history-panel*`

## Definition of Done

- [ ] Route/component tests: leave-day conflict confirm names the work allocations (AC-15), history renders trim and imported entries (AC-16), redacted entry shows «away» (AC-29).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
