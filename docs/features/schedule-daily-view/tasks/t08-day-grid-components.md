---
id: T08
title: "Build the day grid components: rows by resource and by project, day cells, multi-day bars, states with icons"
layer: "ui"
deps: ["T03"]
acs: ["AC-01", "AC-01b", "AC-05"]
files_hint: ["apps/web/app/features/scheduling/components/day-grid.tsx", "apps/web/app/features/scheduling/components/day-cell.tsx", "apps/web/app/features/scheduling/components/day-bar.tsx", "apps/web/app/features/scheduling/components/day-grid.test.tsx", "apps/web/app/features/scheduling/components/board-legend.tsx", "apps/web/app/features/scheduling/test-data.ts"]
owner: "TBD lead"
estimate: "L"
stage: "S1"
status: "todo"
---

# T08 — Build the day grid components: rows by resource and by project, day cells, multi-day bars, states with icons

> Stage 1 — day view · layer `ui` · estimate L · blocked by T03 · ACs AC-01, AC-01b, AC-05

## Why

[ADR-0001](../adr/0001-render-day-view-and-timeline-as-ssr-zooms-of-the-board-url.md) (reuse `shared/ui` and `app.css` tokens); [§8 Accessibility](../sad.md#8-crosscutting-concepts); [AC-01, AC-01b, AC-05](../PRD.md#5-acceptance-criteria).

## What

Compose the existing `board-grid.tsx` / `board-cell.tsx` / `board-by-project.tsx` patterns, `shared/ui` primitives and theme tokens. New components only where no primitive fits: a day column grid and a bar spanning days. Figures shown rounded to the half hour in the web. Project grouping regroups redacted rows client-side.

Files: `apps/web/app/features/scheduling/components/day-grid.tsx`, `apps/web/app/features/scheduling/components/day-cell.tsx`, `apps/web/app/features/scheduling/components/day-bar.tsx`, `apps/web/app/features/scheduling/components/day-grid.test.tsx`, `apps/web/app/features/scheduling/components/board-legend.tsx`, `apps/web/app/features/scheduling/test-data.ts`

## Definition of Done

- [ ] Component tests render the AC-01 fixture (4/8, away, non-working, one labelled bar, overbooked work-on-leave day), the AC-01b project grouping (per-project totals, leave under one «away» group for unentitled viewers), and every state carries a text label and a lucide icon.
- [ ] Component tests (Vitest + Testing Library) pass
- [ ] No new styling system or token; extend `board-legend.tsx` rather than adding a second legend
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Reuses: `board-grid`, `board-cell`, `board-by-project`, `board-legend`, `allocation-popover`, shadcn primitives in `apps/web/app/shared/ui`, lucide-react icons. Built against contract types and `test-data.ts`, so it runs in parallel with T06.
