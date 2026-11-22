---
id: T09
title: "Add zoom=day to the board route: window toolbar (1–4 weeks, earlier/later), zoom switch keeping filters, out-of-range state"
layer: "ui"
deps: ["T06", "T08"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04"]
files_hint: ["apps/web/app/features/scheduling/routes/board.tsx", "apps/web/app/features/scheduling/routes/board.test.ts", "apps/web/app/features/scheduling/components/board-toolbar.tsx", "apps/web/app/features/scheduling/components/board-states.tsx", "apps/web/app/features/scheduling/board.ts", "apps/web/app/features/scheduling/scheduling.server.ts"]
owner: "TBD lead"
estimate: "M"
stage: "S1"
status: "todo"
---

# T09 — Add zoom=day to the board route: window toolbar (1–4 weeks, earlier/later), zoom switch keeping filters, out-of-range state

> Stage 1 — day view · layer `ui` · estimate M · blocked by T06, T08 · ACs AC-01, AC-02, AC-03, AC-04

## Why

[ADR-0001](../adr/0001-render-day-view-and-timeline-as-ssr-zooms-of-the-board-url.md) board URL zoom; [flow 4, critical flow 1](../sad.md#6-runtime-view).

## What

Loader branches on `zoom=day`, keeps `team`, `project`, `view=people|project`. `board-toolbar.tsx` gains the zoom switch, the weeks picker and earlier/later steps within the limits. `board-states.tsx` shows the window error and the not-a-viewer state.

Files: `apps/web/app/features/scheduling/routes/board.tsx`, `apps/web/app/features/scheduling/routes/board.test.ts`, `apps/web/app/features/scheduling/components/board-toolbar.tsx`, `apps/web/app/features/scheduling/components/board-states.tsx`, `apps/web/app/features/scheduling/board.ts`, `apps/web/app/features/scheduling/scheduling.server.ts`

## Definition of Done

- [ ] Route tests show the loader calling getDayView for zoom=day&from&weeks, switching back to weeks starting at the same first week with the same filters (AC-01), no further step offered at a limit (AC-02), the explanation instead of a view for an out-of-range link (AC-03), and the own view offered to a user without view-whole-board (AC-04).
- [ ] Route and loader unit tests pass
- [ ] Typed `hc` client call via `scheduling.server.ts` (no direct fetch)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Shares `board.tsx` with T10 → serialized lane.
