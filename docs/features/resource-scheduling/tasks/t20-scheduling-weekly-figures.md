---
id: T20
title: "Compute weekly figures, cell states, overbooking and the free-list ranking"
layer: "domain"
deps: ["T18", "T19"]
acs: ["AC-01", "AC-04", "AC-10", "AC-15", "AC-21", "AC-21b"]
files_hint: ["modules/scheduling/src/domain/weekly-figures.ts", "modules/scheduling/src/domain/free-list.ts", "modules/scheduling/src/domain/overbooking.ts", "modules/scheduling/src/domain/*.test.ts"]
owner: "TBD (backend lead)"
estimate: "L"
status: "todo"
---

# T20 — Compute weekly figures, cell states, overbooking and the free-list ranking

> Layer `domain` · estimate L · blocked by [T18](./t18-scheduling-capacity-calendar.md), [T19](./t19-scheduling-allocation-aggregate.md) · ACs: AC-01, AC-04, AC-10, AC-15, AC-21, AC-21b

## Why

One rule set for board, free list, warnings and import preview ([ADR-0005](../adr/0005-compute-capacity-and-availability-on-read.md); [sad §10](../sad.md) QG-1).

## What

- Per resource-week: allocated vs capacity, exactly one state (free, partly booked, overbooked, non-working, incomplete record, needing attention) + away days.
- Overbooking impact: affected weeks with hours over; leave-day conflict listing work allocations on leave days (AC-15).
- Free list: rest of current week + N−1 weeks, overbooked week counts 0, ≥ X hours, most free first, incomplete records excluded.

Files: `modules/scheduling/src/domain/weekly-figures.ts`, `modules/scheduling/src/domain/free-list.ts`, `modules/scheduling/src/domain/overbooking.ts`, `modules/scheduling/src/domain/*.test.ts`

## Definition of Done

- [ ] Rule-table tests: AC-10 (32 h cap, 24 + 16 → 8 h over), AC-04 (overbooked week = 0, period from today), AC-01 state per cell incl. «40/40» partly booked, AC-21b (needing attention instead of overbooked, not free), AC-15 leave-day conflict named even when the week fits.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
