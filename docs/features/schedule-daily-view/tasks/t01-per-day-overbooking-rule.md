---
id: T01
title: "Judge overbooking per day and per week, with per-day «made worse», in scheduling/domain"
layer: "domain"
deps: []
acs: ["AC-06", "AC-08"]
files_hint: ["modules/scheduling/src/domain/overbooking.ts", "modules/scheduling/src/domain/overbooking.test.ts"]
owner: "TBD lead"
estimate: "M"
stage: "S1"
status: "todo"
---

# T01 — Judge overbooking per day and per week, with per-day «made worse», in scheduling/domain

> Stage 1 — day view · layer `domain` · estimate M · blocked by — · ACs AC-06, AC-08

## Why

One overbooking rule for every view and warning ([PRD §2 goal 2](../PRD.md#2-goals), [AC-06, AC-08](../PRD.md#5-acceptance-criteria)); [SAD §4 choice 2](../sad.md#4-solution-strategy) and [§8 «Overbooking and overlap rule»](../sad.md#8-crosscutting-concepts); extends [resource-scheduling ADR-0005](../../resource-scheduling/adr/).

## What

Extend `overbooking.ts` so that a day is overbooked when its allocated ticks exceed its daily capacity, and a week when its ticks exceed its capacity **or** it has an overbooked day. `changeImpact` compares before and after, returns the days whose hours over grow and the weeks whose hours over grow or that gain an overbooked day, and names each week's overbooked days. Pure function, exact ticks (resource-scheduling ADR-0009). Keep the existing leave-day rule (resource-scheduling AC-15).

Files: `modules/scheduling/src/domain/overbooking.ts`, `modules/scheduling/src/domain/overbooking.test.ts`

## Definition of Done

- [ ] Rule-table tests in overbooking.test.ts pass for the AC-06 row (Wednesday over by 8 h, week 40/40 overbooked because of Wednesday) and the AC-08 rows (nothing made worse → no confirmation), and pnpm lint + typecheck are clean.
- [ ] Rule-table rows for AC-06 and AC-08 (PRD examples verbatim) pass
- [ ] Existing weekly-only rows still pass, or are updated where per-day judging now changes them (amended resource-scheduling ACs, PRD AC-07)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Pure domain: imports only `@arv/kernel` and sibling domain files. This rule is reused by T04, T05, T16 (overlaps follow the same «made worse» shape) and T30.
