---
id: T24
title: "Add the own timeline (vertical list at 390 px) and overlap marks on the day view and own day view"
layer: "ui"
deps: ["T20", "T23"]
acs: ["AC-25", "AC-30"]
files_hint: ["apps/web/app/features/scheduling/routes/my-schedule.tsx", "apps/web/app/features/scheduling/components/my-schedule.tsx", "apps/web/app/features/scheduling/components/my-timeline-list.tsx", "apps/web/app/features/scheduling/components/day-cell.tsx"]
owner: "TBD lead"
estimate: "M"
stage: "S3"
status: "todo"
---

# T24 — Add the own timeline (vertical list at 390 px) and overlap marks on the day view and own day view

> Stage 3 — time of day · layer `ui` · estimate M · blocked by T20, T23 · ACs AC-25, AC-30

## Why

[Flow 10](../sad.md#6-runtime-view) own branch; [AC-25](../PRD.md#5-acceptance-criteria) «marked on the timeline, on the day view and on the resource's own day view».

## What

Own timeline in `my-schedule.tsx` reusing T23 components on desktop and a new list layout on phones; overlap mark in `day-cell.tsx`.

Files: `apps/web/app/features/scheduling/routes/my-schedule.tsx`, `apps/web/app/features/scheduling/components/my-schedule.tsx`, `apps/web/app/features/scheduling/components/my-timeline-list.tsx`, `apps/web/app/features/scheduling/components/day-cell.tsx`

## Definition of Done

- [ ] Component tests show the own timeline with working hours, timed blocks, own leave type and overlap/overbooking marks and no edit affordance, rendered as a vertical list at 390 px (AC-30), and the day cell showing the overlap mark (AC-25).
- [ ] Component tests pass incl. 390 px variant
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Shares `my-schedule` files with T11 (already done by then).
