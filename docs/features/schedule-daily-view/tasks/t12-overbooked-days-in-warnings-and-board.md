---
id: T12
title: "Name overbooked days in every confirmation dialog and on the weekly board cells"
layer: "ui"
deps: ["T04", "T05"]
acs: ["AC-06", "AC-07", "AC-08"]
files_hint: ["apps/web/app/features/scheduling/components/board-cell.tsx", "apps/web/app/features/scheduling/components/allocation-dialog.tsx", "apps/web/app/features/scheduling/components/leave-dialog.tsx", "apps/web/app/features/scheduling/allocation-action.server.ts", "apps/web/app/features/org/components/employee-record-dialog.tsx", "apps/web/app/features/org/components/holiday-add-dialog.tsx"]
owner: "TBD lead"
estimate: "M"
stage: "S1"
status: "todo"
---

# T12 — Name overbooked days in every confirmation dialog and on the weekly board cells

> Stage 1 — day view · layer `ui` · estimate M · blocked by T04, T05 · ACs AC-06, AC-07, AC-08

## Why

[§8 warn-then-confirm](../sad.md#8-crosscutting-concepts), [AC-06, AC-07, AC-08](../PRD.md#5-acceptance-criteria).

## What

Render `overbookedDays` and per-week overbooked days in the existing confirm dialogs (allocation, leave, employee record, holiday) and in `board-cell.tsx`.

Files: `apps/web/app/features/scheduling/components/board-cell.tsx`, `apps/web/app/features/scheduling/components/allocation-dialog.tsx`, `apps/web/app/features/scheduling/components/leave-dialog.tsx`, `apps/web/app/features/scheduling/allocation-action.server.ts`, `apps/web/app/features/org/components/employee-record-dialog.tsx`, `apps/web/app/features/org/components/holiday-add-dialog.tsx`

## Definition of Done

- [ ] Component tests show the AC-06 warning naming Wednesday +8 h and the week 40/40 with its day, the weekly cell «40/40» in the overbooked state naming Wednesday (AC-07), employee-record and holiday warnings naming days, and no dialog when the action returns saved (AC-08).
- [ ] Component tests for the four dialogs and the board cell pass
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Shares `allocation-dialog.tsx` with T10 and later T17/T23 → serialized by files_hint.
