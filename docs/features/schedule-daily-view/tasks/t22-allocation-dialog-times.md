---
id: T22
title: "Finish the allocation dialog for time of day: 15-minute start/end, hours per day and total, errors, overlaps in the warning"
layer: "ui"
deps: ["T19"]
acs: ["AC-23", "AC-24", "AC-25"]
files_hint: ["apps/web/app/features/scheduling/components/allocation-dialog.tsx", "apps/web/app/features/scheduling/components/allocation-dialog.test.tsx", "apps/web/app/features/scheduling/allocation.ts", "apps/web/app/features/scheduling/allocation-action.server.ts"]
owner: "TBD lead"
estimate: "M"
stage: "S3"
status: "todo"
---

# T22 — Finish the allocation dialog for time of day: 15-minute start/end, hours per day and total, errors, overlaps in the warning

> Stage 3 — time of day · layer `ui` · estimate M · blocked by T19 · ACs AC-23, AC-24, AC-25

## Why

[Flow 11](../sad.md#6-runtime-view); [AC-23, AC-24, AC-25](../PRD.md#5-acceptance-criteria).

## What

Replace T16's minimal inputs with the full UX using `shared/ui` select/input primitives; show «applies from today» for a started allocation.

Files: `apps/web/app/features/scheduling/components/allocation-dialog.tsx`, `apps/web/app/features/scheduling/components/allocation-dialog.test.tsx`, `apps/web/app/features/scheduling/allocation.ts`, `apps/web/app/features/scheduling/allocation-action.server.ts`

## Definition of Done

- [ ] Component tests show start/end in 15-minute steps with hours per day and total, no rate field (AC-23), the end-after-start and 15-minute messages without saving (AC-24), the confirmation listing the AC-25 overlap with both projects, and the leave dialog asking for no times.
- [ ] Component tests pass
- [ ] No new form primitive (reuse shared/ui)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Shares `allocation-dialog.tsx` with T10/T12/T16 → serialized lane.
