---
id: T29
title: "Compute every reachable move and edge position of a gesture by working days in gesture-outcomes.ts"
layer: "domain"
deps: ["T01", "T15", "T16"]
acs: ["AC-13", "AC-14", "AC-15", "AC-16", "AC-19"]
files_hint: ["modules/scheduling/src/domain/gesture-outcomes.ts", "modules/scheduling/src/domain/gesture-outcomes.test.ts"]
owner: "TBD lead"
estimate: "L"
stage: "S2"
status: "todo"
---

# T29 — Compute every reachable move and edge position of a gesture by working days in gesture-outcomes.ts

> Stage 2 — gestures (gated by the recount) · layer `domain` · estimate L · blocked by T01, T15, T16 · ACs AC-13, AC-14, AC-15, AC-16, AC-19

## Why

[ADR-0004](../adr/0004-precompute-gesture-outcomes-once-per-gesture-on-the-server.md); [critical flow 3, flow 9](../sad.md#6-runtime-view); [QG-1](../sad.md#10-quality-requirements) gesture-outcomes rows.

## What

For one allocation, gesture kind (move / start edge / end edge) and the visible window: each reachable position → resulting dates, weekly totals, impact (T01 + T15) or a refusal reason. Leave moves and stretches by whole working days at full daily capacity.

Files: `modules/scheduling/src/domain/gesture-outcomes.ts`, `modules/scheduling/src/domain/gesture-outcomes.test.ts`

## Definition of Done

- [ ] Rule-table tests pass: AC-13 two-step move skipping weekends and holidays and keeping the working-day count, AC-14 started allocation refused for move/start edge and end edge before today, AC-15 positions carrying days/weeks made worse and overlaps, AC-16 positions past the employment end or on a closed project refused with the reason, and AC-19 end edge keeping the interval and hours per day.
- [ ] QG-1 rows for AC-13, AC-14, AC-16, AC-19 pass
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Interval-only (stage 3 built first, SAD §2): no weekly-rate branch.
