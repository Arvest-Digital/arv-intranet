---
id: T05
title: "Apply the per-day rule to the weekly board, own schedule, free list and the org/projects host-wired checks"
layer: "app"
deps: ["T01", "T02", "T03"]
acs: ["AC-07"]
files_hint: ["modules/scheduling/src/application/board.ts", "modules/scheduling/src/application/my-schedule.ts", "modules/scheduling/src/application/free-list.ts", "modules/scheduling/src/application/capacity-impact-check.ts", "modules/scheduling/src/application/project-closing-hook.ts", "modules/scheduling/src/http/presenter.ts", "apps/api/test/integration/composition/ports.test.ts"]
owner: "TBD lead"
estimate: "M"
stage: "S1"
status: "todo"
---

# T05 — Apply the per-day rule to the weekly board, own schedule, free list and the org/projects host-wired checks

> Stage 1 — day view · layer `app` · estimate M · blocked by T01, T02, T03 · ACs AC-07

## Why

[AC-07](../PRD.md#5-acceptance-criteria) amends resource-scheduling AC-01, AC-04, AC-10, AC-15, AC-19c, AC-27; [flows 5 and 6](../sad.md#6-runtime-view); [§11 risk: a port left on no-op](../sad.md#11-risks-and-technical-debt); [resource-scheduling ADR-0007](../../resource-scheduling/adr/).

## What

Board and own-schedule cells get `overbookedDays`; the free list uses the T02 per-day count; `CapacityImpactCheck` and `ProjectClosingHook` return per-day impact. The port shapes stay the same.

Files: `modules/scheduling/src/application/board.ts`, `modules/scheduling/src/application/my-schedule.ts`, `modules/scheduling/src/application/free-list.ts`, `modules/scheduling/src/application/capacity-impact-check.ts`, `modules/scheduling/src/application/project-closing-hook.ts`, `modules/scheduling/src/http/presenter.ts`, `apps/api/test/integration/composition/ports.test.ts`

## Definition of Done

- [ ] Integration tests through the real composition root show a pre-existing daily overload as an overbooked week naming its day on getBoard and getMySchedule, the free list counting 8 free hours for the 8-8-16-8-0 week, and employee-record, holiday and project-close warnings naming the overbooked days (AC-07).
- [ ] Unit tests for board, my-schedule, free-list, both ports pass
- [ ] Integration test through composition root (not a no-op port) passes
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

Shares `presenter.ts` with T04 → serialized lane.
