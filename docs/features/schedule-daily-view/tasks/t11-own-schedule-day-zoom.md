---
id: T11
title: "Add the day zoom to the own schedule (1–4 weeks, two by default, one on a phone, own leave type, read-only)"
layer: "ui"
deps: ["T06", "T08"]
acs: ["AC-04", "AC-12"]
files_hint: ["apps/web/app/features/scheduling/routes/my-schedule.tsx", "apps/web/app/features/scheduling/routes/my-schedule.test.ts", "apps/web/app/features/scheduling/components/my-schedule.tsx"]
owner: "TBD lead"
estimate: "M"
stage: "S1"
status: "todo"
---

# T11 — Add the day zoom to the own schedule (1–4 weeks, two by default, one on a phone, own leave type, read-only)

> Stage 1 — day view · layer `ui` · estimate M · blocked by T06, T08 · ACs AC-04, AC-12

## Why

[Flow 8](../sad.md#6-runtime-view), [ADR-0001](../adr/0001-render-day-view-and-timeline-as-ssr-zooms-of-the-board-url.md) (same params on the own schedule), [§8 Device support](../sad.md#8-crosscutting-concepts).

## What

`my-schedule.tsx` route takes `zoom=day&from&weeks`, calls `getMyDayView`, renders the T08 grid in read-only mode.

Files: `apps/web/app/features/scheduling/routes/my-schedule.tsx`, `apps/web/app/features/scheduling/routes/my-schedule.test.ts`, `apps/web/app/features/scheduling/components/my-schedule.tsx`

## Definition of Done

- [ ] Route and component tests show the own day view with the resource's leave type and overbooked days over 1–4 weeks (two by default, one at 390 px) with no edit affordance (AC-12), and a non-resource told they have no schedule (AC-04).
- [ ] Route + component tests pass
- [ ] Phone default of one week covered by a test
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Reuses the T08 grid. Parallel with T09/T10 (no shared file).
