---
id: T41
title: "Build the allocation create, change and remove dialog"
layer: "ui"
deps: ["T29", "T39"]
acs: ["AC-07", "AC-07a", "AC-07b", "AC-09", "AC-09b", "AC-10", "AC-11", "AC-12", "AC-13", "AC-21b"]
files_hint: ["apps/web/app/features/scheduling/components/allocation-dialog*", "apps/web/app/features/scheduling/routes/board-actions*"]
owner: "TBD (frontend lead)"
estimate: "L"
status: "done"
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

- [x] Route/component tests: overbooking confirm flow (AC-10), conflict message with current values (AC-07b), rule errors (AC-09, AC-13), remove (AC-07a), forbidden (AC-12) (`features/scheduling/routes/board-actions.test.ts`, `features/scheduling/components/allocation-dialog.test.tsx`, `features/scheduling/components/board.test.tsx`).
- [x] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- Follows the V2 design's Allocation boards (create, validation errors, overbooking confirm, edit, conflict, closed project / past, remove confirm) with `app/shared/ui` (dialog, select, input, button, table, alert) and theme tokens. Added `popover` via `pnpm ui:add` (radius set to `rounded-lg`) for the allocation details the design opens from a block; it exports `PopoverClose` too.
- Writes go to the resource route `/schedule/allocations` (`routes/board-actions.ts`, action only) through a fetcher, so the board loader revalidates after each save. Hours are sent as `rateMinutes`; dates and quarter hours are checked in the action and the dialog before the api (AC-09).
- Entry points: «New allocation» in the toolbar; a person's week cell from the current week on (prefills the person and the week); the «Allocate» link of «Who's free» (`allocate`, `allocateFrom`, `allocateTo`, dropped from the URL on close); an allocation block in an expanded row or the 1-week cell opens its details (dates, rate, this week's hours, last changed by — AC-07 — and the week's overbooking) with «Edit» / «Remove». Leave blocks offer only «Remove»; changing leave is T42's «Book leave». «History» is T42.
- Edit: resource and project are read-only (`AllocationChange` has no project); a started allocation keeps its start (not sent) and shows «Changes apply from today» (AC-09b); a closed project (from the projects list's `status`) shows AC-11's message and disables saving; an allocation that needs attention names the employment end (AC-21b).
- Api answers: `ConfirmationRequired` → the weeks over (capacity / allocated / over) and any work on leave days, «Save anyway» resends with `confirm` (AC-10); `version_conflict` → their values beside yours, «Use current values» reloads the form at their version, «Re-apply my changes» resends at it (AC-07b; for a removal «Remove anyway»); rule violations → each rule under its field, naming `lastBookableDate` (AC-09, AC-13); `project_closed` → AC-11; 403 → «You lack the permission to edit allocations» in the dialog, the board stays (AC-12); 401 → sign-in.
- Not in the design's scope here: the availability preview bars (they need per-day capacity and holidays the web doesn't have; the api's overbooking answer covers AC-10) and the «Total» row (the board only carries the window's weeks).
- The resource list is the board's rows (the current filters apply).
