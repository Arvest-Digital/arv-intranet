---
id: T19
title: "Model the Allocation aggregate of effective-dated segments with its rules"
layer: "domain"
deps: ["T01"]
acs: ["AC-09", "AC-09b", "AC-11", "AC-13", "AC-21b", "AC-07b"]
files_hint: ["modules/scheduling/src/domain/allocation.ts", "modules/scheduling/src/domain/allocation.test.ts", "modules/scheduling/src/domain/errors.ts"]
owner: "TBD (backend lead)"
estimate: "L"
status: "todo"
---

# T19 — Model the Allocation aggregate of effective-dated segments with its rules

> Layer `domain` · estimate L · blocked by [T01](./t01-permissions-on-actor.md) · ACs: AC-09, AC-09b, AC-11, AC-13, AC-21b, AC-07b

## Why

Changes «from today» never rewrite the past ([ADR-0008](../adr/0008-model-allocation-as-effective-dated-segments.md); [PRD §5](../PRD.md) AC-09b); input rules of AC-09, AC-13, AC-11, AC-21b.

## What

- `Allocation` (employee, project, version, segments). Commands: create, change-from-today, remove-from-today, trim-at(date) — each returns the new segment list + a history entry value.
- Rules: end ≥ start; rate > 0, multiple of 15 min, ≤ 24 h/day or ≤ 24 h × working days/week; no new start before today; within employment period; project open over the dates; AC-21b — shortening/removal allowed past the end date, other changes refused.
- Tagged errors carrying which rule broke (and the last bookable date for AC-13).

Files: `modules/scheduling/src/domain/allocation.ts`, `modules/scheduling/src/domain/allocation.test.ts`, `modules/scheduling/src/domain/errors.ts`

## Definition of Done

- [ ] Table-driven tests for each AC-09 rule, AC-13 (names the 15th), AC-11, AC-21b.
- [ ] AC-09b test: 1 Oct–30 Nov at 20 h, today 28 Oct, change to 10 h → segments [1–27 Oct @20, 28 Oct–30 Nov @10]; removal → [1–27 Oct @20]; a new start before today refused.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
