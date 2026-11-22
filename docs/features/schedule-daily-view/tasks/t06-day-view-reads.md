---
id: T06
title: "Serve GET /scheduling/day-view and /scheduling/my-schedule/day-view with redaction applied before the DTO"
layer: "ports"
deps: ["T02", "T03"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-12"]
files_hint: ["modules/scheduling/src/application/day-view.ts", "modules/scheduling/src/application/day-view.test.ts", "modules/scheduling/src/application/my-schedule.ts", "modules/scheduling/src/http/routes.ts", "modules/scheduling/src/http/presenter.ts", "modules/scheduling/src/domain/visibility.ts", "apps/api/test/integration/scheduling/day-view.test.ts", "apps/api/test/integration/redaction/matrix.test.ts"]
owner: "TBD lead"
estimate: "L"
stage: "S1"
status: "todo"
---

# T06 — Serve GET /scheduling/day-view and /scheduling/my-schedule/day-view with redaction applied before the DTO

> Stage 1 — day view · layer `ports` · estimate L · blocked by T02, T03 · ACs AC-01, AC-02, AC-03, AC-04, AC-05, AC-12

## Why

[ADR-0005](../adr/0005-serve-day-view-and-timeline-through-dedicated-reads.md) dedicated reads; [ADR-0001](../adr/0001-render-day-view-and-timeline-as-ssr-zooms-of-the-board-url.md) bounded window; [critical flow 1, flow 8](../sad.md#6-runtime-view); [QG-2](../sad.md#10-quality-requirements); `getDayView`, `getMyDayView` in [openapi.yaml](../contracts/openapi.yaml).

## What

Use cases `day-view.ts` (window ≤4 weeks, 12 months back, 52 weeks ahead, team/project filters, grouped by resource) and the own day view in `my-schedule.ts`. Routes `GET /scheduling/day-view` and `GET /scheduling/my-schedule/day-view`. The presenter applies the visibility policy (leave → «away», nothing after the end date for unentitled viewers) before the DTO is built.

Files: `modules/scheduling/src/application/day-view.ts`, `modules/scheduling/src/application/day-view.test.ts`, `modules/scheduling/src/application/my-schedule.ts`, `modules/scheduling/src/http/routes.ts`, `modules/scheduling/src/http/presenter.ts`, `modules/scheduling/src/domain/visibility.ts`, `apps/api/test/integration/scheduling/day-view.test.ts`, `apps/api/test/integration/redaction/matrix.test.ts`

## Definition of Done

- [ ] Integration tests return the AC-01 fixture's cells and bars, 400 window_out_of_range for 5 weeks or outside the limits (AC-03), 403 or the own view for a user without view-whole-board (AC-04), and the redaction matrix shows no leave type, leave project, end date or post-end allocation for an unentitled viewer (AC-05, QG-2).
- [ ] `day-view.test.ts` unit tests pass
- [ ] Integration tests for AC-01, AC-03, AC-04, AC-12 pass
- [ ] Redaction matrix extended with both new reads × every permission combination (assert on the response body)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

Project grouping (AC-01b) is done in the web over already-redacted rows (SAD flow 4 flag), so it needs no read here. Shares `presenter.ts`/`routes.ts` lane with T04/T05.
