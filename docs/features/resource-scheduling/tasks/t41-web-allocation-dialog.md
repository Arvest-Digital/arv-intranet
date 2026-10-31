---
id: T41
title: "Build the allocation create, change and remove dialog"
layer: "ui"
deps: ["T29", "T39"]
acs: ["AC-07", "AC-07a", "AC-07b", "AC-09", "AC-09b", "AC-10", "AC-11", "AC-12", "AC-13", "AC-21b"]
files_hint: ["apps/web/app/features/scheduling/components/allocation-dialog*", "apps/web/app/features/scheduling/routes/board-actions*"]
owner: "TBD (frontend lead)"
estimate: "L"
status: "todo"
---

# T41 — Build the allocation create, change and remove dialog

> Layer `ui` · estimate L · blocked by [T29](./t29-scheduling-http-writes.md), [T39](./t39-web-board.md) · ACs: AC-07, AC-07a, AC-07b, AC-09, AC-09b, AC-10, AC-11, AC-12, AC-13, AC-21b

## Why

Edits are route actions; client JS only for dialogs and confirmations ([ADR-0002](../adr/0002-render-board-ssr-with-week-window-in-url.md); [ADR-0010](../adr/0010-confirm-by-resubmitting-with-typed-confirmation-errors.md)).

## What

- Dialog opened from a board cell; hours per day/week, date range, project select (open projects only); action submits with `version`.
- `ConfirmationRequired` → overbooking dialog listing weeks and hours over → resubmit with `confirm: true`; `Conflict` → shows the other user's values; rule errors per field.
- Compose `app/shared/ui` primitives (table, dialog, select, dropdown-menu, input, button) and theme tokens; no new design system ([ADR-0002](../adr/0002-render-board-ssr-with-week-window-in-url.md)). Add a shadcn component via `pnpm ui:add` only if none fits.

Files: `apps/web/app/features/scheduling/components/allocation-dialog*`, `apps/web/app/features/scheduling/routes/board-actions*`

## Definition of Done

- [ ] Route/component tests: overbooking confirm flow (AC-10), conflict message with current values (AC-07b), rule errors (AC-09, AC-13), remove (AC-07a), forbidden (AC-12).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
