---
id: T18
title: "Implement tick arithmetic and the capacity calendar"
layer: "domain"
deps: ["T01"]
acs: ["AC-06", "AC-08", "AC-19", "AC-27", "AC-15"]
files_hint: ["modules/scheduling/src/domain/ticks.ts", "modules/scheduling/src/domain/capacity.ts", "modules/scheduling/src/domain/capacity.test.ts"]
owner: "TBD (backend lead)"
estimate: "L"
status: "todo"
---

# T18 — Implement tick arithmetic and the capacity calendar

> Layer `domain` · estimate L · blocked by [T01](./t01-permissions-on-actor.md) · ACs: AC-06, AC-08, AC-19, AC-27, AC-15

## Why

Exact capacity per day over working days, holidays and the employment period ([ADR-0009](../adr/0009-store-minutes-and-compute-in-1-420-minute-ticks.md); [ADR-0005](../adr/0005-compute-capacity-and-availability-on-read.md); [sad §10](../sad.md) QG-1).

## What

- Ticks of 1/420 minute; conversions minutes↔ticks; display rounding to the nearest half hour only at the edge.
- Daily capacity = contract minutes ÷ working days on working days, 0 on holidays and outside the employment period; unknown for incomplete records.
- ISO-week bucketing; rate→per-day spread for `day` / `week` / `full-day` segments.

Files: `modules/scheduling/src/domain/ticks.ts`, `modules/scheduling/src/domain/capacity.ts`, `modules/scheduling/src/domain/capacity.test.ts`

## Definition of Done

- [ ] Rule-table tests with the PRD rows: AC-08 (40 h/wk from Wednesday → 24 h; holiday Thursday → 32 h), AC-19 (24 h Mon–Wed → 8 h/day), AC-27 (Monday holiday: full-timer drops, Wed–Fri part-timer unchanged), AC-15 (leave day = contract ÷ working days).
- [ ] Property: summing daily ticks of a full week equals contract ticks exactly for every working-day count 1–7.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
