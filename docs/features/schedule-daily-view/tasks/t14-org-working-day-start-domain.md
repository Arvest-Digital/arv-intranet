---
id: T14
title: "Add the working-day start to EmployeeRecord in org/domain (09:00 default, 15-minute step, ends by 24:00)"
layer: "domain"
deps: []
acs: ["AC-27", "AC-27b"]
files_hint: ["modules/org/src/domain/employee-record.ts", "modules/org/src/domain/employee-record.test.ts", "modules/org/src/domain/errors.ts"]
owner: "TBD lead"
estimate: "S"
stage: "S3"
status: "todo"
---

# T14 — Add the working-day start to EmployeeRecord in org/domain (09:00 default, 15-minute step, ends by 24:00)

> Stage 3 — time of day · layer `domain` · estimate S · blocked by — · ACs AC-27, AC-27b

## Why

[ADR-0002](../adr/0002-store-daily-time-interval-as-minutes-on-segments-and-drop-the-rate.md) (working end computed, never stored); [data-model `org.employee_records`](../data-model.md#orgemployee_records-changed).

## What

`EmployeeRecord.workingDayStart` (minutes) with the step and end-by-24:00 rules; `workingDayEnd` computed from daily capacity. An incomplete record (no contract hours) gets the step rule only.

Files: `modules/org/src/domain/employee-record.ts`, `modules/org/src/domain/employee-record.test.ts`, `modules/org/src/domain/errors.ts`

## Definition of Done

- [ ] Rule-table tests pass: default 540 on a new record, 08:00 accepted giving 08:00–16:00 (AC-27), off-step and 17:00 + 8 h refused with a tagged error, and 09:00 + 6 h 24 min ending at 15:24 accepted (AC-27b).
- [ ] Rule-table rows for AC-27 and AC-27b pass
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Pure; parallel with T15. Org domain has no scheduling import.
