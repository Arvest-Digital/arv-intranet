---
id: T31
title: "Build the pointer gesture island over the day grid: move and edge drags with a live preview, drop to save, confirm or revert"
layer: "ui"
deps: ["T28", "T30", "T10"]
acs: ["AC-13", "AC-14", "AC-15", "AC-16", "AC-17", "AC-18", "AC-19"]
files_hint: ["apps/web/app/features/scheduling/components/gesture-island.tsx", "apps/web/app/features/scheduling/components/gesture-preview.tsx", "apps/web/app/features/scheduling/components/gesture-island.test.tsx", "apps/web/app/features/scheduling/routes/board-actions.ts"]
owner: "TBD lead"
estimate: "L"
stage: "S2"
status: "todo"
---

# T31 — Build the pointer gesture island over the day grid: move and edge drags with a live preview, drop to save, confirm or revert

> Stage 2 — gestures (gated by the recount) · layer `ui` · estimate L · blocked by T28, T30, T10 · ACs AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19

## Why

[ADR-0004](../adr/0004-precompute-gesture-outcomes-once-per-gesture-on-the-server.md), [ADR-0001](../adr/0001-render-day-view-and-timeline-as-ssr-zooms-of-the-board-url.md) (client island, absent on phones); [critical flow 3, flow 9](../sad.md#6-runtime-view).

## What

Client island using the T28 choice; preview from the table only; drop = existing PATCH action with `version`/`confirm`; reuse the existing confirm dialog.

Files: `apps/web/app/features/scheduling/components/gesture-island.tsx`, `apps/web/app/features/scheduling/components/gesture-preview.tsx`, `apps/web/app/features/scheduling/components/gesture-island.test.tsx`, `apps/web/app/features/scheduling/routes/board-actions.ts`

## Definition of Done

- [ ] Component tests show the outcome table fetched once at gesture start, each one-day step updating dates, weekly totals and impacts from it, a drop saving through the action, the confirmation on impact (AC-15), and revert with the server's message on refusal, conflict or lost permission (AC-14, AC-16, AC-17, AC-18); no island renders at 390 px.
- [ ] Component tests pass
- [ ] Only the package approved in T28 is added
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Reuses the T08 grid and the T12 confirm dialog.
