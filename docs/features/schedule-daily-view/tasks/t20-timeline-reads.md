---
id: T20
title: "Serve GET /scheduling/timeline and /scheduling/my-schedule/timeline, and mark overlaps on day-view cells"
layer: "ports"
deps: ["T15", "T16", "T18"]
acs: ["AC-21", "AC-22", "AC-25", "AC-29", "AC-30"]
files_hint: ["modules/scheduling/src/application/timeline.ts", "modules/scheduling/src/application/timeline.test.ts", "modules/scheduling/src/application/my-schedule.ts", "modules/scheduling/src/application/day-view.ts", "modules/scheduling/src/http/routes.ts", "modules/scheduling/src/http/presenter.ts", "packages/contracts/src/scheduling/reads.ts", "apps/api/test/integration/scheduling/timeline.test.ts", "apps/api/test/integration/redaction/matrix.test.ts"]
owner: "TBD lead"
estimate: "L"
stage: "S3"
status: "todo"
---

# T20 — Serve GET /scheduling/timeline and /scheduling/my-schedule/timeline, and mark overlaps on day-view cells

> Stage 3 — time of day · layer `ports` · estimate L · blocked by T15, T16, T18 · ACs AC-21, AC-22, AC-25, AC-29, AC-30

## Why

[ADR-0005](../adr/0005-serve-day-view-and-timeline-through-dedicated-reads.md), [ADR-0001](../adr/0001-render-day-view-and-timeline-as-ssr-zooms-of-the-board-url.md); [flow 10](../sad.md#6-runtime-view); [QG-2](../sad.md#10-quality-requirements); `getTimeline`, `getMyTimeline` in [openapi.yaml](../contracts/openapi.yaml); [api-sync D-2](../contracts/api-sync-report.md#section-d--deferrals).

## What

Use case `timeline.ts` (one day, grouped by resource, filters, AC-02 limits) and the own timeline in `my-schedule.ts`; working-day start from `OrgApi`. Contract `Timeline`, `TimelineRow`, blocks, `workingHours`. `DayCell.timeOverlap` on both day views. Presenter redacts before the DTO.

Files: `modules/scheduling/src/application/timeline.ts`, `modules/scheduling/src/application/timeline.test.ts`, `modules/scheduling/src/application/my-schedule.ts`, `modules/scheduling/src/application/day-view.ts`, `modules/scheduling/src/http/routes.ts`, `modules/scheduling/src/http/presenter.ts`, `packages/contracts/src/scheduling/reads.ts`, `apps/api/test/integration/scheduling/timeline.test.ts`, `apps/api/test/integration/redaction/matrix.test.ts`

## Definition of Done

- [ ] Integration tests return the AC-21 fixture (working hours 09:00–17:00, two blocks, 6/8), leave filling working hours as «away» on AC-22's day, 400 for a date outside the limits, 404 not_a_resource on the own timeline for a non-resource, DayCell.timeOverlap set on the AC-25 day, and the redaction matrix shows no blocks or working hours after an end date for an unentitled viewer (AC-29).
- [ ] Unit + integration tests pass
- [ ] Redaction matrix extended with both timeline reads × permission combinations
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

Shares `presenter.ts`/`routes.ts` lane with T19.
