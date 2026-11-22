---
id: T25
title: "Add the working-day start field to the employee record dialog"
layer: "ui"
deps: ["T18"]
acs: ["AC-27", "AC-27b"]
files_hint: ["apps/web/app/features/org/components/employee-record-dialog.tsx", "apps/web/app/features/org/components/employee-record-dialog.test.tsx", "apps/web/app/features/org/employee-record.ts", "apps/web/app/features/org/employee-record-action.server.ts"]
owner: "TBD lead"
estimate: "S"
stage: "S3"
status: "todo"
---

# T25 — Add the working-day start field to the employee record dialog

> Stage 3 — time of day · layer `ui` · estimate S · blocked by T18 · ACs AC-27, AC-27b

## Why

[Flow 12](../sad.md#6-runtime-view); [US-10](../PRD.md#4-user-stories).

## What

Field in `employee-record-dialog.tsx` reusing shared/ui inputs; action maps `Invalid` to the message.

Files: `apps/web/app/features/org/components/employee-record-dialog.tsx`, `apps/web/app/features/org/components/employee-record-dialog.test.tsx`, `apps/web/app/features/org/employee-record.ts`, `apps/web/app/features/org/employee-record-action.server.ts`

## Definition of Done

- [ ] Component tests show the field in 15-minute steps defaulting to 09:00, working hours shown as start + daily capacity exactly (15:24 for 6 h 24 min), and the AC-27b refusal message from the action.
- [ ] Component tests pass
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Shares `employee-record-dialog.tsx` with T12 (done earlier).
