---
id: T10
title: "Open the existing forms from the day view: select a day range to prefill, click a bar to edit, read-only details for viewers"
layer: "ui"
deps: ["T09"]
acs: ["AC-09", "AC-10", "AC-11"]
files_hint: ["apps/web/app/features/scheduling/components/day-grid.tsx", "apps/web/app/features/scheduling/components/allocation-popover.tsx", "apps/web/app/features/scheduling/components/allocation-dialog.tsx", "apps/web/app/features/scheduling/components/leave-dialog.tsx", "apps/web/app/features/scheduling/routes/board.tsx", "apps/web/app/features/scheduling/routes/board-actions.ts"]
owner: "TBD lead"
estimate: "M"
stage: "S1"
status: "todo"
---

# T10 — Open the existing forms from the day view: select a day range to prefill, click a bar to edit, read-only details for viewers

> Stage 1 — day view · layer `ui` · estimate M · blocked by T09 · ACs AC-09, AC-10, AC-11

## Why

[Flow 7](../sad.md#6-runtime-view); forms and route actions reused per [ADR-0001](../adr/0001-render-day-view-and-timeline-as-ssr-zooms-of-the-board-url.md).

## What

One continuous range in one resource's row → existing `allocation-dialog` / `leave-dialog` with prefilled values; the save goes through the existing `board-actions.ts` actions. Bar click → edit dialog for editors, `allocation-popover` read-only for others. No selection or click-to-edit on phones (PRD §3).

Files: `apps/web/app/features/scheduling/components/day-grid.tsx`, `apps/web/app/features/scheduling/components/allocation-popover.tsx`, `apps/web/app/features/scheduling/components/allocation-dialog.tsx`, `apps/web/app/features/scheduling/components/leave-dialog.tsx`, `apps/web/app/features/scheduling/routes/board.tsx`, `apps/web/app/features/scheduling/routes/board-actions.ts`

## Definition of Done

- [ ] Component tests show that selecting Tuesday–Thursday in one row opens the allocation (or leave) dialog with that resource and those dates (AC-09), clicking a bar opens its edit dialog (AC-10), and a view-only user gets the read-only popover with leave redacted and nothing opens on selection (AC-11).
- [ ] Component tests for AC-09, AC-10, AC-11 pass
- [ ] Form validation unchanged (past dates, employment period refused on save)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Reuses `allocation-dialog`, `leave-dialog`, `allocation-popover`. Shares `day-grid.tsx` and `board.tsx` with T08/T09 → serialized lane.
