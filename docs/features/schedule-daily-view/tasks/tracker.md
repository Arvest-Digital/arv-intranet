# Tracker — schedule-daily-view

> Status of every task in the epic. `implement-tasks` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`. Sizing: S = 2 h, M = half a day, L = one day.

| # | Task | Stage | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|---|
| [T01](./t01-per-day-overbooking-rule.md) | Judge overbooking per day and per week, with per-day «made worse», in scheduling/domain | S1 | domain | TBD lead | M | — | todo |
| [T02](./t02-day-figures-and-free-list.md) | Compute day cells, multi-day allocation bars and the per-day free list in scheduling/domain | S1 | domain | TBD lead | M | — | todo |
| [T03](./t03-s1-contract-shapes.md) | Add the stage 1 contract shapes (day view, per-day impact) to @arv/contracts/scheduling and the base contract | S1 | ports | TBD lead | S | — | todo |
| [T04](./t04-per-day-impact-on-saves.md) | Warn per day on allocation and leave saves (create, change, leave) and map overbookedDays in the presenter | S1 | app | TBD lead | M | T01, T03 | todo |
| [T05](./t05-per-day-rule-in-weekly-reads-and-ports.md) | Apply the per-day rule to the weekly board, own schedule, free list and the org/projects host-wired checks | S1 | app | TBD lead | M | T01, T02, T03 | todo |
| [T06](./t06-day-view-reads.md) | Serve GET /scheduling/day-view and /scheduling/my-schedule/day-view with redaction applied before the DTO | S1 | ports | TBD lead | L | T02, T03 | todo |
| [T07](./t07-request-duration-log-line.md) | Replace hono/logger with a one-line structured request log (route id, status, ms) in the api host | S1 | wiring | TBD lead | S | — | todo |
| [T08](./t08-day-grid-components.md) | Build the day grid components: rows by resource and by project, day cells, multi-day bars, states with icons | S1 | ui | TBD lead | L | T03 | todo |
| [T09](./t09-board-day-zoom-route.md) | Add zoom=day to the board route: window toolbar (1–4 weeks, earlier/later), zoom switch keeping filters, out-of-range state | S1 | ui | TBD lead | M | T06, T08 | todo |
| [T10](./t10-start-change-from-day-view.md) | Open the existing forms from the day view: select a day range to prefill, click a bar to edit, read-only details for viewers | S1 | ui | TBD lead | M | T09 | todo |
| [T11](./t11-own-schedule-day-zoom.md) | Add the day zoom to the own schedule (1–4 weeks, two by default, one on a phone, own leave type, read-only) | S1 | ui | TBD lead | M | T06, T08 | todo |
| [T12](./t12-overbooked-days-in-warnings-and-board.md) | Name overbooked days in every confirmation dialog and on the weekly board cells | S1 | ui | TBD lead | M | T04, T05 | todo |
| [T13](./t13-s1-e2e.md) | Add stage 1 e2e: day-view spec with an axe audit, and update the weekly board spec for per-day overbooking | S1 | tests | TBD lead | M | T09, T10, T11, T12 | todo |
| [T14](./t14-org-working-day-start-domain.md) | Add the working-day start to EmployeeRecord in org/domain (09:00 default, 15-minute step, ends by 24:00) | S3 | domain | TBD lead | S | — | todo |
| [T15](./t15-working-hours-and-time-overlap-domain.md) | Add working-hours.ts and time-overlap.ts (per-day overlaps, «made worse») to scheduling/domain | S3 | domain | TBD lead | M | — | todo |
| [T16](./t16-migration-scheduling-time-interval.md) | Promote staged migration 120000: replace the rate with the daily time interval in scheduling storage, domain and contract | S3 | migration | TBD lead | L | T04, T05, T06, T12 | todo |
| [T17](./t17-migration-org-working-day-start.md) | Promote staged migration 120001: add org.employee_records.working_day_start_minute (one-shot DEFAULT 540, dropped) | S3 | migration | TBD lead | S | T14, T16 | todo |
| [T18](./t18-org-working-day-start-ports.md) | Expose the working-day start through @arv/contracts/org, the employee-record routes and OrgApi employment terms | S3 | ports | TBD lead | M | T17 | todo |
| [T19](./t19-interval-rules-on-saves.md) | Validate the time interval on allocation saves, apply interval changes from today, and add time overlaps to the impact | S3 | app | TBD lead | M | T15, T16 | todo |
| [T20](./t20-timeline-reads.md) | Serve GET /scheduling/timeline and /scheduling/my-schedule/timeline, and mark overlaps on day-view cells | S3 | ports | TBD lead | L | T15, T16, T18 | todo |
| [T21](./t21-import-time-per-row.md) | Accept a start and end time per import row and refuse rows with a weekly rate | S3 | app | TBD lead | M | T16 | todo |
| [T22](./t22-allocation-dialog-times.md) | Finish the allocation dialog for time of day: 15-minute start/end, hours per day and total, errors, overlaps in the warning | S3 | ui | TBD lead | M | T19 | todo |
| [T23](./t23-board-timeline-route.md) | Build the one-day timeline route and components: time axis, blocks, working hours, free time, away, out-of-hours and overlap marks | S3 | ui | TBD lead | L | T20 | todo |
| [T24](./t24-own-timeline-and-day-overlap-marks.md) | Add the own timeline (vertical list at 390 px) and overlap marks on the day view and own day view | S3 | ui | TBD lead | M | T20, T23 | todo |
| [T25](./t25-working-day-start-field.md) | Add the working-day start field to the employee record dialog | S3 | ui | TBD lead | S | T18 | todo |
| [T26](./t26-s3-e2e.md) | Add stage 3 e2e: timeline spec with an axe audit, booking with a time and an overlap warning, working-day start | S3 | tests | TBD lead | M | T22, T23, T24, T25 | todo |
| [T27](./t27-s3-release-runbook-and-docs.md) | Write the stage 3 release runbook (ADR-0003 guard, QG-4 count check) and fold the S3 delta into the base contract and ARCHITECTURE.md | S3 | docs | TBD lead | S | T16, T17, T20 | todo |
| [T28](./t28-decide-drag-and-drop-support.md) | Decide the drag-and-drop support for the gesture island and record it as an ADR | S2 | docs | TBD lead | S | — | todo |
| [T29](./t29-gesture-outcomes-domain.md) | Compute every reachable move and edge position of a gesture by working days in gesture-outcomes.ts | S2 | domain | TBD lead | L | T01, T15, T16 | todo |
| [T30](./t30-gesture-outcomes-read-and-drop.md) | Serve GET /scheduling/allocations/{id}/gesture-outcomes and harden the gesture drop on PATCH (version, confirm, permission at drop) | S2 | ports | TBD lead | M | T29, T19 | todo |
| [T31](./t31-pointer-gesture-island.md) | Build the pointer gesture island over the day grid: move and edge drags with a live preview, drop to save, confirm or revert | S2 | ui | TBD lead | L | T28, T30, T10 | todo |
| [T32](./t32-keyboard-gestures.md) | Add keyboard move and stretch to the gesture island (arrow keys, confirm, Escape to cancel) | S2 | ui | TBD lead | M | T31 | todo |
| [T33](./t33-s2-e2e-and-perf.md) | Add stage 2 e2e: drag and keyboard specs, a keyboard-only axe run, and the 300 ms preview performance test | S2 | tests | TBD lead | M | T32 | todo |

**Total:** 33 tasks, ~18.25 person-days (stage 1: ~7 · stage 3: ~7.5 · stage 2: ~3.75).

**Gates outside the DAG:**
- **T21** waits for the PRD §8 import decision (PM + Tech Lead, before stage 3).
- **T28–T33 (stage 2)** start only if the spreadsheet recount funds stage 2 (PRD §7; SAD §11 moves the recount to 2 weeks after the first production launch).
- **Stage 3 release** follows the [T27](./t27-s3-release-runbook-and-docs.md) runbook. The ADR-0003 guard stops production if real allocations exist.
