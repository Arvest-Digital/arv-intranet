---
id: T23
title: "Build the one-day timeline route and components: time axis, blocks, working hours, free time, away, out-of-hours and overlap marks"
layer: "ui"
deps: ["T20"]
acs: ["AC-21", "AC-22", "AC-26", "AC-29"]
files_hint: ["apps/web/app/features/scheduling/routes/timeline.tsx", "apps/web/app/features/scheduling/routes/timeline.test.ts", "apps/web/app/features/scheduling/components/timeline-grid.tsx", "apps/web/app/features/scheduling/components/timeline-block.tsx", "apps/web/app/features/scheduling/components/timeline-grid.test.tsx", "apps/web/app/routes.ts"]
owner: "TBD lead"
estimate: "L"
stage: "S3"
status: "todo"
---

# T23 — Build the one-day timeline route and components: time axis, blocks, working hours, free time, away, out-of-hours and overlap marks

> Stage 3 — time of day · layer `ui` · estimate L · blocked by T20 · ACs AC-21, AC-22, AC-26, AC-29

## Why

[ADR-0001](../adr/0001-render-day-view-and-timeline-as-ssr-zooms-of-the-board-url.md) (timeline route with `date=`); [flow 10](../sad.md#6-runtime-view); [api-sync notes: axis is a rendering rule](../contracts/api-sync-report.md#notes).

## What

New route `timeline.tsx` registered in `routes.ts`; opened from the day view. Time axis and blocks are new components (no existing primitive fits); labels, popovers and tokens are reused. View-only with horizontal scrolling on phones.

Files: `apps/web/app/features/scheduling/routes/timeline.tsx`, `apps/web/app/features/scheduling/routes/timeline.test.ts`, `apps/web/app/features/scheduling/components/timeline-grid.tsx`, `apps/web/app/features/scheduling/components/timeline-block.tsx`, `apps/web/app/features/scheduling/components/timeline-grid.test.tsx`, `apps/web/app/routes.ts`

## Definition of Done

- [ ] Route and component tests render AC-21 (09:00–17:00, blocks 09:00–13:00 and 14:00–16:00, 6/8, free spans, axis at least 08:00–18:00 widened to fit), AC-22 (leave as «away» over working hours, holiday non-working, work on leave overbooked), AC-26 out-of-hours mark, day stepping within limits, and the out-of-range explanation.
- [ ] Route + component tests pass
- [ ] Every state labelled with text + lucide icon
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Reuses `board-toolbar` filters, `allocation-popover`, shared/ui, theme tokens.
