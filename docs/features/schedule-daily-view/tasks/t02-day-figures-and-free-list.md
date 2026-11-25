---
id: T02
title: "Compute day cells, multi-day allocation bars and the per-day free list in scheduling/domain"
layer: "domain"
deps: []
acs: ["AC-01", "AC-05", "AC-07", "AC-12"]
files_hint: ["modules/scheduling/src/domain/daily-figures.ts", "modules/scheduling/src/domain/daily-figures.test.ts", "modules/scheduling/src/domain/free-list.ts", "modules/scheduling/src/domain/free-list.test.ts"]
owner: "TBD lead"
estimate: "M"
stage: "S1"
status: "todo"
---

# T02 — Compute day cells, multi-day allocation bars and the per-day free list in scheduling/domain

> Stage 1 — day view · layer `domain` · estimate M · blocked by — · ACs AC-01, AC-05, AC-07, AC-12

## Why

Per-day figures already exist inside `weekly-figures.ts`; the day view needs them per resource-day ([AC-01](../PRD.md#5-acceptance-criteria), [AC-07](../PRD.md#5-acceptance-criteria)). [SAD §5](../sad.md#5-building-block-view) `daily-figures.ts`, `free-list.ts`.

## What

New `daily-figures.ts`: for a resource and a window of ≤4 ISO weeks, build one cell per day (allocated vs daily capacity, away, non-working, overbooked; leave day with work → away + hours + overbooked mark) and allocation bars spanning days. Reuse `capacity.ts` and `weekly-figures.ts`; do not add a second capacity calculation. Change `free-list.ts` so a week's free hours are the sum of each working day's positive free hours, and zero only when the week's total exceeds capacity.

Files: `modules/scheduling/src/domain/daily-figures.ts`, `modules/scheduling/src/domain/daily-figures.test.ts`, `modules/scheduling/src/domain/free-list.ts`, `modules/scheduling/src/domain/free-list.test.ts`

## Definition of Done

- [ ] Rule-table tests pass for AC-01 (4/8 on a working day, away on the leave day, holiday and weekend non-working, one bar across the covered days) and AC-07 (8, 8, 16, 8, 0 → Wednesday overbooked, 8 free hours), and lint + typecheck are clean.
- [ ] AC-01 and AC-07 rows pass
- [ ] A row for an employment period ending mid-window gives zero capacity after the end (input for AC-05 redaction in T06)
- [ ] Figures stay exact (ticks); no rounding in the domain
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Runs in parallel with T01. Shares no file with it.
