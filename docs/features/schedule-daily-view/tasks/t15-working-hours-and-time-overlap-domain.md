---
id: T15
title: "Add working-hours.ts and time-overlap.ts (per-day overlaps, «made worse») to scheduling/domain"
layer: "domain"
deps: []
acs: ["AC-21", "AC-25", "AC-26"]
files_hint: ["modules/scheduling/src/domain/working-hours.ts", "modules/scheduling/src/domain/working-hours.test.ts", "modules/scheduling/src/domain/time-overlap.ts", "modules/scheduling/src/domain/time-overlap.test.ts"]
owner: "TBD lead"
estimate: "M"
stage: "S3"
status: "todo"
---

# T15 — Add working-hours.ts and time-overlap.ts (per-day overlaps, «made worse») to scheduling/domain

> Stage 3 — time of day · layer `domain` · estimate M · blocked by — · ACs AC-21, AC-25, AC-26

## Why

[SAD §5](../sad.md#5-building-block-view) `working-hours.ts`, `time-overlap.ts`; [§8 overlap rule](../sad.md#8-crosscutting-concepts); [QG-1 rows](../sad.md#10-quality-requirements).

## What

Pure functions over a local interval value (`{ startMinute, endMinute }`): working hours = start + daily capacity; free spans; overlaps per day between non-leave intervals; `overlapImpact(before, after)` with the same «made worse» shape as T01; parts outside working hours.

Files: `modules/scheduling/src/domain/working-hours.ts`, `modules/scheduling/src/domain/working-hours.test.ts`, `modules/scheduling/src/domain/time-overlap.ts`, `modules/scheduling/src/domain/time-overlap.test.ts`

## Definition of Done

- [ ] Rule-table tests pass: AC-21 «6/8» with free 13:00–14:00 and 16:00–17:00, AC-25 09:00–13:00 + 11:00–12:00 → overlap 11:00–12:00 warned only when made worse (new overlap or growing overlap time, incl. extending onto new days), leave never overlapping, and AC-26 outside working hours marked with no warning.
- [ ] QG-1 rows for AC-21, AC-25, AC-26 pass
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Does not depend on the storage swap: it takes intervals as input. T17 then feeds it real segments.
