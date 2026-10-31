# Tracker — resource-scheduling

> Status of every task in the epic. `implement-tasks` updates `done` as it commits each task.
> States: `todo` · `in_progress` · `blocked` · `review` · `done`.

| # | Task | Layer | Owner | Estimate | Blocked by | Status |
|---|---|---|---|---|---|---|
| T01 | [Carry the permission set on Actor and resolve it per request](./t01-permissions-on-actor.md) | wiring | TBD (backend lead) | M | — | todo |
| T02 | [Implement UnitOfWorkLive with a CurrentTx FiberRef read by query()](./t02-unit-of-work-live.md) | infra | TBD (backend lead) | M | — | todo |
| T03 | [Add Forbidden, ConfirmationRequired, detailed Conflict and ValidationError contract errors](./t03-contract-errors.md) | ports | TBD (backend lead) | M | — | todo |
| T04 | [Scaffold org, projects and scheduling modules and register them](./t04-scaffold-modules.md) | wiring | TBD (backend lead) | S | — | todo |
| T05 | [Promote the org schema: teams, employee_records, public_holidays](./t05-migration-org.md) | migration | TBD (backend lead) | S | T04 | todo |
| T06 | [Promote the projects schema: projects](./t06-migration-projects.md) | migration | TBD (backend lead) | S | T04 | todo |
| T07 | [Promote the scheduling schema: allocations, segments, history, import_runs](./t07-migration-scheduling.md) | migration | TBD (backend lead) | S | T04 | todo |
| T08 | [Model EmployeeRecord, Team and PublicHoliday with their validation rules](./t08-org-domain.md) | domain | TBD (backend lead) | M | T01 | todo |
| T09 | [Add org Drizzle repositories and test fixtures](./t09-org-infra.md) | infra | TBD (backend lead) | M | T02, T05, T08 | todo |
| T10 | [Implement employee-record use cases, the CapacityImpactCheck port and the org facade](./t10-org-employee-records-app.md) | app | TBD (backend lead) | L | T09 | todo |
| T11 | [Implement team and public-holiday use cases](./t11-org-teams-holidays-app.md) | app | TBD (backend lead) | M | T10 | todo |
| T12 | [Expose employee-record endpoints with end-date redaction](./t12-org-http-employee-records.md) | ports | TBD (backend lead) | M | T03, T10 | todo |
| T13 | [Expose team and public-holiday endpoints](./t13-org-http-teams-holidays.md) | ports | TBD (backend lead) | M | T11, T12 | todo |
| T14 | [Model Project with type, name comparison and open/closed on a date](./t14-projects-domain.md) | domain | TBD (backend lead) | S | T01 | todo |
| T15 | [Add the projects Drizzle repository and fixtures](./t15-projects-infra.md) | infra | TBD (backend lead) | S | T02, T06, T14 | todo |
| T16 | [Implement create and close-with-preview use cases, the ProjectClosingHook port and the projects facade](./t16-projects-app.md) | app | TBD (backend lead) | M | T15 | todo |
| T17 | [Expose project endpoints with leave-project redaction in the list](./t17-projects-http.md) | ports | TBD (backend lead) | M | T03, T16 | todo |
| T18 | [Implement tick arithmetic and the capacity calendar](./t18-scheduling-capacity-calendar.md) | domain | TBD (backend lead) | L | T01 | todo |
| T19 | [Model the Allocation aggregate of effective-dated segments with its rules](./t19-scheduling-allocation-aggregate.md) | domain | TBD (backend lead) | L | T01 | todo |
| T20 | [Compute weekly figures, cell states, overbooking and the free-list ranking](./t20-scheduling-weekly-figures.md) | domain | TBD (backend lead) | L | T18, T19 | todo |
| T21 | [Implement the scheduling permission and visibility policy](./t21-scheduling-visibility-policy.md) | domain | TBD (backend lead) | M | T01 | todo |
| T22 | [Add scheduling Drizzle repositories and fixtures](./t22-scheduling-infra.md) | infra | TBD (backend lead) | L | T02, T07, T19 | todo |
| T23 | [Implement create, change and remove allocation use cases](./t23-scheduling-allocation-commands.md) | app | TBD (backend lead) | L | T10, T16, T20, T21, T22 | todo |
| T24 | [Implement the book-leave use case](./t24-scheduling-book-leave.md) | app | TBD (backend lead) | M | T23 | todo |
| T25 | [Implement the board and free-list queries](./t25-scheduling-board-free-list.md) | app | TBD (backend lead) | L | T10, T16, T20, T21, T22 | todo |
| T26 | [Implement the my-schedule and allocation-history queries](./t26-scheduling-my-schedule-history.md) | app | TBD (backend lead) | M | T25 | todo |
| T27 | [Implement CapacityImpactCheck and ProjectClosingHook in scheduling](./t27-scheduling-port-implementations.md) | app | TBD (backend lead) | M | T11, T16, T23 | todo |
| T28 | [Expose board, free-list, my-schedule, allocation and history read endpoints](./t28-scheduling-http-reads.md) | ports | TBD (backend lead) | M | T03, T25, T26 | todo |
| T29 | [Expose allocation and leave write endpoints](./t29-scheduling-http-writes.md) | ports | TBD (backend lead) | M | T23, T24, T28 | todo |
| T30 | [Wire scheduling's port implementations in the composition root](./t30-wire-composition-ports.md) | wiring | TBD (backend lead) | M | T13, T17, T27, T29 | todo |
| T31 | [Add the monthly allocation-history purge and its Cron Trigger](./t31-history-purge-cron.md) | wiring | TBD (backend lead) | M | T22, T30 | todo |
| T32 | [Add the QG-2 redaction matrix and the concurrent-save test](./t32-redaction-concurrency-matrix.md) | tests | TBD (backend lead) | L | T30 | todo |
| T33 | [Add org and projects import commands that join the caller's unit of work](./t33-import-facade-commands.md) | app | TBD (backend lead) | M | T10, T16 | todo |
| T34 | [Implement import parsing, validation and the preview](./t34-import-preview.md) | app | TBD (backend lead) | L | T23, T33 | blocked |
| T35 | [Implement the one-time import commit and its endpoints](./t35-import-commit.md) | app | TBD (backend lead) | M | T29, T34 | blocked |
| T36 | [Build the employee-record screens](./t36-web-employee-records.md) | ui | TBD (frontend lead) | L | T12 | todo |
| T37 | [Build the teams and public-holiday screens](./t37-web-teams-holidays.md) | ui | TBD (frontend lead) | M | T13 | todo |
| T38 | [Build the project list, create and close-with-preview screens](./t38-web-projects.md) | ui | TBD (frontend lead) | M | T17 | todo |
| T39 | [Build the schedule board with the week window and filters in the URL](./t39-web-board.md) | ui | TBD (frontend lead) | L | T28 | todo |
| T40 | [Build the free-list and my-schedule screens](./t40-web-free-list-my-schedule.md) | ui | TBD (frontend lead) | M | T28 | todo |
| T41 | [Build the allocation create, change and remove dialog](./t41-web-allocation-dialog.md) | ui | TBD (frontend lead) | L | T29, T39 | todo |
| T42 | [Build the leave dialog and the allocation history panel](./t42-web-leave-history.md) | ui | TBD (frontend lead) | M | T41 | todo |
| T43 | [Build the import upload, preview and confirm screen](./t43-web-import.md) | ui | TBD (frontend lead) | M | T35 | blocked |
| T44 | [Add the board end-to-end test with the accessibility audit](./t44-e2e-board-a11y.md) | tests | TBD (backend lead) | M | T30, T39, T41 | todo |

**Total:** 44 tasks, ~26.5 person-days (S = 2 h, M = half-day, L = 1 day).

`blocked` = waiting on an external input (the spreadsheet sample), not on another task.
