---
status: Draft
owner: "dmitro.b"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-11-21"
feature_size: "L"
stage: "03"
ticket: "BRIEFS B-01 (docs/features/resource-scheduling/BRIEFS.md)"
---

# PRD — schedule-daily-view

> **Inputs (required):** [idea-brief](./idea-brief.md) · [CONTEXT](../../../CONTEXT.md) (repo-root glossary; this repo is single-context)
> **Reference module:** `modules/scheduling` — per-day figures and daily capacity (`src/domain/weekly-figures.ts`, `src/domain/capacity.ts`), the weekly-only overbooking check and its «only what the change makes worse» rule (`src/domain/overbooking.ts`), the board window limits and permission checks (`src/domain/errors.ts`, `src/domain/visibility.ts`).
> **External context channels used:** Project docs: [`ARCHITECTURE.md`](../../../ARCHITECTURE.md), [resource-scheduling PRD](../resource-scheduling/PRD.md) and [SAD](../resource-scheduling/sad.md) (no `docs/architecture-map.md` yet).

Domain terms (**resource**, **allocation**, **capacity**, **daily capacity**, **day view**, **availability**, **contract hours**, **employment period**, **project**, **closed project**, **leave**, **public holiday**, **overbooking**, **team**, **permission**, **user**) follow [`CONTEXT.md`](../../../CONTEXT.md). Stage 3 terms **working hours**, **time interval** and **time overlap** are in the same glossary.

## 1. Context

The schedule board shows weeks. The people who plan (PMs, delivery managers and team leads, ~5 users with the edit-allocations permission) can see that a resource has 24 of 40 hours booked in a week, but not which days are free, which days someone is away, or what sits on Monday versus Friday. A survey of all five (2026-11) found that every one of them still keeps the old planning spreadsheet next to the board, and that the main reason is to see the plan day by day. That defeats the scheduling MVP's goal of retiring the spreadsheet rather than running it alongside ([resource-scheduling PRD §2](../resource-scheduling/PRD.md#2-goals)). The ~30 scheduled employees would also like to read their own schedule day by day.

Planners asked for a day view as soon as the weekly board shipped, and the question was already open in [resource-scheduling PRD §8](../resource-scheduling/PRD.md#8-open-questions). There is no hard deadline, but the longer two planning places run in parallel, the more they diverge.

We commit to **Approach C — Staged Day View, Gesture Editing** (idea-brief §13): a day view of the existing board (one to four weeks, a column per day). **Stage 1** is the read view plus select-days-to-create and click-to-edit through the existing forms. **Stage 2** adds moving and stretching an allocation by whole days by dragging, with keyboard equivalents, through the same save rules and confirmation. Stage 2 is funded only if the spreadsheet is still in use when we recount after stage 1. **Stage 3 — Time of day** (added 2026-11-21, part of the current iteration, not gated by the recount) adds a one-day timeline: every allocation gets a required daily time interval, the weekly rate is removed, each employee record gains a working-day start, and a time-overlap warning joins the overbooking warning ([BRIEF B-01](./BRIEF.md#b-01-one-day-view-by-hour-time-of-day)). Until stage 3 ships, allocations keep one fixed rate per day or week; from stage 3, one fixed time interval per day. Editing stays whole-allocation and whole-day.

Traceability:
- Raw idea (baseline, verbatim, confirmed 2026-11-21): «A day-column zoom of the schedule board (one to four weeks, a column per day) showing each resource's allocated hours against their daily capacity, leave days and public holidays — editable in place: first by selecting days or clicking a bar to open the existing forms, then by dragging to move or stretch an allocation by whole days, always keeping the weekly overbooking warning.»
- Reference module: per-day figures and daily capacity are already computed for every resource-day and summed into the weekly figures, so the day view adds no stored data. The overbooking check today judges whole weeks only, plus the leave-day rule (resource-scheduling AC-15), and asks for confirmation only when a change makes things worse.
- Interview decisions (2026-11-21, medium depth): one PRD for both stages, each story tagged; visibility rules unchanged but at day precision; a started allocation cannot be moved, only its end changed; stretching keeps the rate; overbooking is judged per day as well as per week, in every place that judges it, from stage 1.
- **KPI dropped — overridden by author** (critic F3: «share of changes started from the day view», idea-brief §7 supporting metric) — rationale: it would need new stored data, which the feature otherwise avoids; goal 3 is judged by the spreadsheet KPI (planners keeping the spreadsheet → 0).
- **Decision override:** per-day overbooking adopted (idea-brief §5 and §14 rejected it) — rationale: the planner survey (2026-11) showed that the weekly rule hides daily overload, which planners now catch in the spreadsheet; this is the revisit trigger named in §14. The glossary entries **overbooking** and **daily capacity** were updated on 2026-11-21. The baseline's «always keeping the weekly overbooking warning» still holds: the weekly warning stays, and a per-day check is added.
- **Decision override — stage 3, time of day (author, 2026-11-21):** adopted after this PRD was clarified; reverses «the day view adds no stored data» for stage 3 only. Decisions: time interval required on every allocation, per day, in 15-minute steps; weekly rate removed and existing weekly-rate allocations converted; working-day start on the employee record, end = start + daily capacity; time overlap warned like overbooking; outside working hours allowed silently; migration starts every existing allocation at the working-day start; leave whole days; one company time zone; visibility as the board ([BRIEF B-01](./BRIEF.md#b-01-one-day-view-by-hour-time-of-day), idea-brief §13 «Scope change»). Rationale source still to be recorded (§8): the 2026-11 survey named day-by-day planning, not time of day.
- **KPIs dropped — author decision (clarify-prd, 2026-11-21):** «day view adoption» and «daily overload seen ahead» — rationale: not needed to judge this feature, and neither could be measured without defining new events or confirming per-user request logs; the feature is judged by the spreadsheet KPI and the latency target.

## 2. Goals

- The people who plan see and change the plan day by day on the board itself, so the planning spreadsheet is retired rather than run alongside.
- One overbooking rule holds on the board, the day view and every save warning: a day over its daily capacity is overbooked and warned about, just like a week over its capacity, so the day view never shows a problem that saving ignores. The free list is the one intended exception: it counts real free hours day by day, so one overbooked day does not hide the free hours on the other days of that week (AC-07).
- Small day-level changes (shift by a day, extend by two days) take one gesture instead of a form round-trip, with the same warnings and rules that planners already trust (stage 2).
- The people who plan see when in the day each resource works on what, and are warned before booking one person twice at the same time (stage 3).

## 3. Non-goals

- **Different hours or times on individual days within one allocation** — the allocation keeps one fixed rate per day or week (from stage 3: one fixed time interval per day); uneven plans are booked as separate allocations (idea-brief §5).
- **Part-day leave, per-employee time zones, breaks inside the working day** — stage 3 keeps leave whole-day, one company time zone, and working hours as one continuous span (BRIEF B-01).
- **Dragging an allocation onto another resource (reassignment), multi-select, bulk or batched moves, staging, scenarios and tentative bookings** — each adds a new consistency model (Approach B, parked); reassignment stays «remove and create again» (idea-brief §5, §14).
- **Gesture editing on phones** — on phones the board's day view is view-only (no selecting days, no click-to-edit, no gestures); allocations are still changed through the forms reached from the weekly board; gestures need a pointer or keyboard (idea-brief §5).
- **Undo of a gesture** — the change history already shows every change with before/after values; an undo action is an open question for the post-stage-1 checkpoint (§8).

## 4. User stories

### US-01: View the plan day by day *(Stage 1)*
**As a** user with the view-whole-board permission
**I want** to switch the schedule board to a day view of one to four weeks and see each resource's allocated hours against their daily capacity per day, their allocations across the days they cover, and leave days and public holidays
**So that** I can see which days are free and who is away when, without the spreadsheet

### US-02: Be warned about an overbooked day *(Stage 1)*
**As a** user with the edit-allocations permission
**I want** a save that puts a resource over their daily capacity on any day to warn me and name those days, even when the week stays within capacity
**So that** daily overload is caught before it happens instead of in the spreadsheet

### US-03: Start a change from the day view *(Stage 1)*
**As a** user with the edit-allocations permission
**I want** to select days of a resource to open the allocation or leave form already filled with that resource and those dates, and to click an allocation to open its edit form
**So that** I plan from the day I am looking at, without re-typing dates

### US-04: See my own schedule by day *(Stage 1)*
**As a** resource with an intranet login
**I want** to see my own allocations and leave day by day against my daily capacity
**So that** I know what I am booked on each day

### US-05: Move an allocation by dragging *(Stage 2)*
**As a** user with the edit-allocations permission
**I want** to drag an allocation that has not started yet, including leave, to other days of the same resource, by whole days
**So that** shifting a plan by a few days takes one gesture instead of a form

### US-06: Stretch or shorten an allocation by dragging *(Stage 2)*
**As a** user with the edit-allocations permission
**I want** to drag an allocation's start or end edge, including leave's, by whole days to make it longer or shorter, seeing the new dates and weekly hours before I let go
**So that** extending or trimming a plan is quick and its effect is predictable

### US-07: Move and stretch with the keyboard *(Stage 2)*
**As a** user with the edit-allocations permission who does not use a pointer
**I want** to move and stretch an allocation by whole days with the keyboard, with the same preview, rules and warnings as dragging
**So that** gesture editing is open to everyone who plans

### US-08: See one day by time of day *(Stage 3)*
**As a** user with the view-whole-board permission
**I want** to open one day of the board on a time-of-day axis and see each resource's allocations as blocks at their times, their working hours, leave and any time overlap
**So that** I know who works on what and when within the day

### US-09: Book an allocation at a time of day *(Stage 3)*
**As a** user with the edit-allocations permission
**I want** to give every allocation a daily start and end time and be warned when it overlaps another allocation of the same resource
**So that** the plan says when the work happens, not only how many hours

### US-10: Keep each resource's working hours *(Stage 3)*
**As a** user with the manage-employee-records permission
**I want** to set when a resource's working day starts
**So that** the timeline shows their working hours

## 5. Acceptance criteria

### AC-01 (US-01) — happy path
**Given** a user with the view-whole-board permission, a resource with 40 contract hours over Monday to Friday, a 20-hours-per-week allocation to a project from the start of the current week to next Wednesday, annual leave on next Thursday, and a public holiday on next Monday
**When** the user switches the schedule board to the day view
**Then** the board shows two weeks with one column per day, starting from the first week the weekly board was showing (here the current week, so the current week and the next one), and the resource's row shows, for each day, allocated hours against daily capacity (such as «4/8» on a working day), «away» in place of figures on the leave day, the public holiday and the weekend as non-working days, the allocation as one bar across the days it covers, labelled with the project and its hours per day, and the leave as its own bar labelled «away» (or with its leave type, for viewers allowed to see it); a leave day that also carries work hours shows «away», those work hours and the overbooked mark; figures are shown rounded to the nearest half hour, the board's team and project filters keep applying, and switching back to weeks shows the weekly board starting at the day view's first week, with the same filters

### AC-01b (US-01) — happy path
**Given** a user with the view-whole-board permission is on the day view
**When** the user switches it from grouping by resource to grouping by project
**Then** the day view shows the same days, filters and figures grouped by project — for each project its total allocated hours per day (leave excluded) and, for each resource on it, their hours on that project per day next to their whole-day figures — with the same visibility rules as the weekly board grouped by project: viewers without the see-leave-reasons permission see all leave under one «away» group with no leave type or leave project name, and allocations past an employment end date stay hidden from viewers who may not see it

### AC-02 (US-01) — happy path
**Given** a user with the view-whole-board permission is on the day view
**When** the user picks a window of one, two, three or four weeks, or moves the window earlier or later
**Then** the day view shows that many weeks, and can be moved back up to 12 months and forward up to 52 weeks ahead, the same limits as the weekly board; at a limit, moving further is not offered and the window stays at the limit

### AC-03 (US-01) — error
**Given** a user with the view-whole-board permission
**When** the user asks, for example through a shared link, for a day view longer than four weeks, or one that starts more than 12 months back or ends more than 52 weeks ahead
**Then** the system shows no day view and tells the user that it shows one to four weeks within 12 months back and 52 weeks ahead

### AC-04 (US-01) — authorization
**Given** a user with neither the view-whole-board nor the edit-allocations permission
**When** the user tries to open the day view of the schedule board
**Then** the system shows no other resource's days and, if the user is a resource, offers the day view of their own schedule instead; a user who is not a resource is told they have no schedule to show

### AC-05 (US-01) — authorization
**Given** a resource on sick leave next Monday whose employment ends next Wednesday, and a viewer with the view-whole-board permission but none of the see-leave-reasons, manage-employee-records or edit-allocations permissions
**When** the viewer looks at that resource on the day view
**Then** the viewer sees «away» on Monday with no leave type or leave project name, and from next Thursday on sees zero daily capacity with no allocations, no overbooking and no mark that employment ended, exactly as the weekly board hides them

### AC-06 (US-02) — domain invariant
**Given** a resource with 8 hours of daily capacity Monday to Friday and an allocation of 8 hours per day from Monday to Wednesday
**When** a user with the edit-allocations permission adds an allocation of 8 hours per day for the same resource on Wednesday and Thursday of that week, so the week totals 40 of 40 hours
**Then** the system warns that the resource will be overbooked on Wednesday by 8 hours and names that week as overbooked on Wednesday with its total of 40 of 40 hours (a week's own hours over are named only when its total exceeds its capacity), saves only after the user confirms, and then the day view marks Wednesday as overbooked and the weekly board shows that week as «40/40» in the overbooked state, naming Wednesday as the overbooked day

### AC-07 (US-02) — cross-context
**Given** allocations saved before this feature that put a resource over their daily capacity on a day while the week stays within capacity
**When** any viewer allowed to see that resource opens the weekly board, the day view, their own schedule or the free list
**Then** that day is overbooked on the day view and on the resource's own day view, and its week is overbooked on the weekly board and in the resource's own schedule (shown with its figure, such as «40/40», in the overbooked state and naming the overbooked days), and the warnings shown before saving a change to an employee record or to the holiday list also name the days that would become overbooked, because the board, the day view and every overbooking warning use the same per-day and per-week rule (this amends resource-scheduling AC-01, AC-10, AC-15, AC-19c and AC-27); the free list counts a week's free hours as the sum, over the resource's working days, of each day's daily capacity minus its allocated hours where that is above zero, and counts a week as zero only when its total exceeds its capacity — for example, a 40-hour week booked 8, 8, 16, 8 and 0 hours from Monday to Friday is overbooked on Wednesday and still shows 8 free hours, because Friday's free hours are real (this amends resource-scheduling AC-04)

### AC-08 (US-02) — domain invariant
**Given** a resource whose Wednesday is already overbooked by 8 hours
**When** a user with the edit-allocations permission makes a change that grows no day's hours over its daily capacity, grows no week's hours over its capacity and makes no new day overbooked — such as shortening or moving an allocation off Wednesday, or adding 2 hours on Friday of the same week, which stays within Friday's 8 hours
**Then** the system saves without asking for confirmation, because the warning only names days and weeks that the change makes worse: a day is made worse when its hours over daily capacity grow, and a week when its hours over capacity grow or it gains a newly overbooked day

### AC-09 (US-03) — happy path
**Given** a user with the edit-allocations permission on the day view
**When** the user selects Tuesday to Thursday of next week in a resource's row and chooses to add an allocation (or leave)
**Then** the existing allocation (or leave) form opens with that resource and those dates filled in, and after the user saves it, the new allocation appears on those days; a selection is always one continuous range of days in one resource's row, and dates the form does not accept (such as past dates or dates outside the employment period) are refused by the form on save with its usual explanation

### AC-10 (US-03) — happy path
**Given** a user with the edit-allocations permission on the day view
**When** the user clicks an allocation bar
**Then** the existing edit form of that allocation opens with its current values, and the same save rules apply as anywhere else (past not rewritten, closed project, employment period, overbooking warning)

### AC-11 (US-03) — authorization
**Given** a user with the view-whole-board permission but not the edit-allocations permission
**When** the user selects days or clicks an allocation bar on the day view, or tries to drag it
**Then** no form opens and nothing moves; clicking a bar shows the allocation's details read-only (project, dates, rate and hours, with leave shown under the same visibility rules as AC-01b and AC-05), selecting days does nothing, and the plan stays unchanged

### AC-12 (US-04) — happy path
**Given** a user who is a resource and has no view-whole-board permission
**When** the user opens the day view of their own schedule
**Then** the user sees their own allocations and leave day by day against their daily capacity, including the type of their own leave and their overbooked days, over a window of one to four weeks (two by default, one on a phone) within the same limits as AC-02, and cannot change any of them

### AC-13 (US-05) — happy path
**Given** a user with the edit-allocations permission and an allocation from next Monday to next Wednesday that has not started yet
**When** the user drags it two days later and lets go
**Then** while dragging the user sees the new dates, the resource's total hours against capacity for each affected week, and the days and weeks the move would make overbooked or worse, and after letting go the allocation runs from next Wednesday to next Friday with the same rate, the history records the change with who made it and when, and a move that makes no day or week worse (AC-08) saves without any confirmation; an allocation moves by the resource's working days — each step skips weekends, public holidays and the resource's non-working days, both ends always fall on working days, and the allocation keeps its number of working days and so its total hours; leave moves the same way, and moving leave onto days with work hours brings up the same warning that names that work as booking leave in the form does

### AC-14 (US-05) — domain invariant
**Given** an allocation that started on the 1st of the month, and today is the 21st (an allocation has started when its start date is before today)
**When** a user with the edit-allocations permission tries to drag the whole allocation to other days, drag its start edge, or drag its end edge to before today
**Then** the system does not save the change and tells the user that past plans are not rewritten, and the allocation goes back to where it was; dragging its end edge to today or later is allowed and changes it from today, like the edit form; an allocation that has not started cannot be moved, or have its start edge dragged, to before today either

### AC-15 (US-05) — domain invariant
**Given** a user with the edit-allocations permission drags an allocation onto days where the resource would be over their daily or weekly capacity
**When** the user lets go
**Then** the system shows the same overbooking warning as the form, naming each day it makes worse with its hours over and each affected week with its total against capacity (and its hours over when the total exceeds capacity), saves only after the user confirms, and puts the allocation back where it was if the user cancels

### AC-16 (US-05) — cross-context
**Given** a resource whose employment period ends on the 15th, and a closed project
**When** a user with the edit-allocations permission drags an allocation of that resource so it runs past the 15th, or drags any allocation of the closed project
**Then** the system does not save the change, puts the allocation back, and tells the user either that it falls outside the resource's employment period, naming the 15th as the last date they can be allocated, or that the project is closed and accepts no changed allocations

### AC-17 (US-05) — concurrent edit
**Given** two users with the edit-allocations permission see the same allocation on the day view
**When** the first moves it and then the second drags it as it was before
**Then** the system keeps the first change, refuses the second, puts the allocation where the first user left it, and tells the second user that it was changed meanwhile by the first user; an open day view does not update live — it shows other users' changes after the user's own next save, refusal or reload

### AC-18 (US-05) — cross-context
**Given** a user whose access role no longer grants the edit-allocations permission, changed in the roles and permissions feature after the user opened the day view
**When** the user next drags an allocation and lets go
**Then** the system refuses as if the user never had the permission, puts the allocation back, and tells the user they lack the permission to edit allocations

### AC-19 (US-06) — happy path
**Given** an allocation of 20 hours per week for three full weeks, for a resource who works Monday to Friday
**When** a user with the edit-allocations permission drags its end edge two working days into the following week
**Then** while dragging, by working days as in AC-13, the user sees the new end date, that the following week gets 8 hours of this allocation, the resource's total hours against capacity for each affected week, and any day the change would make overbooked or worse, and after letting go the allocation keeps its rate of 20 hours per week and the new days get their share of it by working days, as when the end date is changed in the form; dragging an edge of leave adds or removes whole working days, each taking the resource's full daily capacity, and the same warning names any work on the new leave days. Once stage 3 ships there is no rate per week: a stretched allocation keeps its daily time interval and its hours per day (AC-23, AC-28)

### AC-20 (US-07) — happy path
**Given** a user with the edit-allocations permission working on the day view with the keyboard only
**When** the user moves focus to an allocation, chooses to move it or change its start or end, shifts it day by day with the arrow keys, and confirms
**Then** the user gets the same preview of dates and weekly hours, the same rules and the same warnings as when dragging, and can cancel at any point before confirming so that nothing changes

### AC-21 (US-08) — happy path
**Given** a user with the view-whole-board permission, a resource with 40 contract hours over Monday to Friday and a working-day start of 09:00, and on next Tuesday an allocation to one project from 09:00 to 13:00 and an allocation to another project from 14:00 to 16:00
**When** the user opens next Tuesday as a one-day timeline from the day view
**Then** the resource's row shows their working hours 09:00–17:00, the two allocations as blocks at 09:00–13:00 and 14:00–16:00 labelled with project and hours, «6/8» as the day's figure, and free time 13:00–14:00 and 16:00–17:00; the timeline covers at least 08:00–18:00 and widens to the earliest start and latest end shown; the user can move one day earlier or later within the limits of AC-02, and the team and project filters keep applying

### AC-22 (US-08) — happy path
**Given** a resource on leave next Tuesday, and a public holiday next Wednesday
**When** a user with the view-whole-board permission looks at those days on the timeline
**Then** the leave fills the resource's whole working hours as one block labelled «away» (or with its leave type, for viewers allowed to see it, AC-05), the public holiday shows the resource as non-working all day, and any allocation on the leave day is drawn over it with the overbooked mark, as in AC-01

### AC-23 (US-09) — happy path
**Given** a user with the edit-allocations permission
**When** the user creates or edits an allocation
**Then** the form asks for dates and a daily start and end time in 15-minute steps (start before end, at most 24 hours), shows the hours per day and the total hours this gives, and no longer offers a rate per week; after saving, the allocation shows at that time on every working day it covers

### AC-24 (US-09) — error
**Given** a user with the edit-allocations permission in the allocation form
**When** the user enters an end time not after the start time, or a time not on a 15-minute step
**Then** the form does not save and explains that the end must be after the start and that times go in 15-minute steps

### AC-25 (US-09) — domain invariant
**Given** a resource with an allocation from 09:00 to 13:00 every working day next week
**When** a user with the edit-allocations permission adds an allocation for the same resource on next Tuesday from 11:00 to 12:00, which keeps the day within its daily capacity
**Then** the system warns that the resource will be booked twice on Tuesday from 11:00 to 12:00, naming both projects, saves only after the user confirms, and the timeline marks the overlap; overlaps are named only when the change creates or lengthens them, like the overbooking rule in AC-08, and they are named in the same warning as overbooked days and weeks

### AC-26 (US-09) — domain invariant
**Given** a resource with working hours 09:00–17:00
**When** a user with the edit-allocations permission saves an allocation from 17:00 to 19:00 that overlaps nothing and keeps the day within capacity
**Then** the system saves it without a warning, and the timeline marks the part outside working hours

### AC-27 (US-10) — happy path
**Given** a user with the manage-employee-records permission editing an employee record with 40 contract hours over Monday to Friday
**When** the user sets the working-day start to 08:00 and saves
**Then** the resource's working hours become 08:00–16:00 (start plus daily capacity), daily and weekly capacity do not change, no allocation moves, and a new employee record starts at 09:00 unless set otherwise

### AC-28 (US-09) — cross-context
**Given** allocations saved before stage 3: one at 4 hours per day and one at 20 hours per week, for a resource working Monday to Friday from 09:00, both on next Tuesday
**When** stage 3 ships
**Then** both allocations get a daily time interval starting at the resource's working-day start: 09:00–13:00 for the 4-hours-per-day one, and 09:00–13:00 for the 20-hours-per-week one (20 hours ÷ 5 working days), so they overlap on Tuesday and the timeline marks it; no confirmation is asked, the change history records the conversion as a system change with before/after values, and in a week with a public holiday or leave the converted allocation now counts its hours per day only on working days, so that week's total can be lower than before (this amends resource-scheduling AC on the allocation form, the import format and AC-19 of this PRD)

### AC-29 (US-08) — authorization
**Given** a viewer with the view-whole-board permission but none of the see-leave-reasons, manage-employee-records or edit-allocations permissions
**When** the viewer opens a day on the timeline
**Then** the viewer sees times of allocations and working hours of every resource they may see on the board, leave as «away» with no type or leave project, and after an employment end date no blocks and no working hours, exactly as AC-05; a user without the view-whole-board permission sees only their own timeline, as in AC-04

### AC-30 (US-08) — happy path
**Given** a user who is a resource and has no view-whole-board permission
**When** the user opens one day of their own schedule on the timeline
**Then** the user sees their own working hours, allocations at their times, the type of their own leave and any overlap or overbooking, cannot change them, and on a phone (390 px) sees the day as a vertical list of time blocks

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Latency p95, open the day view (100 resources × 4 weeks) | ≤ 1500 ms | server request-duration metric for the day-view request, production |
| Latency p95, save a dragged or keyboard change (incl. overbooking check) | ≤ 500 ms | server request-duration metric for allocation saves, production |
| Gesture feedback while dragging | preview of dates, weekly totals against capacity and the days made overbooked or worse updates within 300 ms of each one-day step | automated browser performance test in CI on a 100-resource × 4-week board |
| Latency p95, open a one-day timeline (100 resources) | ≤ 1000 ms | server request-duration metric for the timeline request, production |
| Migration correctness (stage 3) | 100% of existing allocations get a time interval; hours per day of every converted allocation match its rate rule (weekly rate ÷ working days per full week, rounded per §8); every conversion is in the history | automated migration test on a copy of production data before release, plus a count check after release |
| Availability | 99.5% monthly (same as the board) | intranet uptime monitor, monthly SLO window |
| Calculation correctness | 100% of daily figures, of per-day and per-week overbooking verdicts and of time-overlap verdicts (stage 3) match the capacity rules (working days, holidays, part-timers, employment period, leave); figures are computed exactly, shown rounded to the nearest half hour (so rounded days need not add up to the shown week), and overbooking is judged on exact figures | automated rule-table tests in CI |
| Concurrency | 0 lost updates when two users change the same allocation by gesture or form | automated concurrent-save test in CI (AC-17) |
| Accessibility | every gesture has a keyboard equivalent; free, booked, overbooked, away and non-working days are distinguishable without colour; text contrast ≥ 4.5:1 | automated accessibility audit of the day view in CI, plus a keyboard-only run of AC-20 |
| Device support | desktop-first; on phones (390 px wide) the day view of the own schedule (one week) is fully readable and the board's day view is view-only with horizontal scrolling; no gestures on phones | manual check at a 390 px viewport in the pre-release review of each stage |

## 6.1 Security / privacy

- **Data classification:** confidential — named employees' daily workload and absences; sick leave is health-related.
- **Personal data touched:** stages 1–2: no new fields; existing leave days, public holidays and zero-capacity days become visible at day precision instead of as weekly counts. Stage 3: two new fields — the working-day start on the employee record and the daily time interval on each allocation; whole-board viewers see when in the day each person works.
- **AuthZ/AuthN impact:** no new permissions. The day view follows the board's rules: view-whole-board (or edit-allocations, which includes it) to see the whole board by day; edit-allocations to open forms from the day view, drag or use the keyboard to change; see-leave-reasons for leave types; manage-employee-records or edit-allocations to see an employment end date. Permissions are checked at every save, not at sign-in.
- **Abuse cases:**
  - Sick-leave patterns at day precision (for example, always away on Mondays): viewers without the see-leave-reasons permission see only «away», never the type or the leave project; the resource themselves sees their own type. Residual risk accepted: whole-board viewers can see on which days someone is away, which the weekly «away, N days» already partly reveals.
  - Unannounced departure through the day view: viewers without the manage-employee-records or edit-allocations permission see zero daily capacity after the end date with no allocations, no overbooking and no end mark. Residual risk accepted and flagged for security review: the exact first day of zero capacity is now visible instead of only the week.
  - Browsing colleagues by day without the view-whole-board permission: only the user's own day view is shown; other resources are neither listed nor counted.
  - Bulk tampering by gesture: each drag or keyboard change is one attributed change in history and counts toward the existing limit of 120 allocation changes per minute per user.
  - Stale permission during a long session: each drop or keyboard confirmation is checked at that moment (AC-18).
  - Working-pattern profiling (stage 3): working hours and times of allocations reveal when someone works (e.g. always starts late). Residual risk accepted: same audience as the board, no new permission (BRIEF B-01 decision 11); flagged for security review.
- **Security review:** Required — health-related absence data is shown at day precision, and per-day overbooking changes what every board viewer sees.

## 7. Metrics / KPIs

- **Planners keeping the spreadsheet** — baseline: 5 of 5 (survey, 2026-11); target: ≤ 3 at the recount 2 weeks after stage 1 ships (the stage 2 funding checkpoint: stage 2 is funded only if at least one still keeps it), and 0 within 6 weeks after stage 2 ships, with the spreadsheet archived read-only.
- **Day view latency p95** — baseline: n/a (new view); target: ≤ 1500 ms at 100 resources × 4 weeks, tracked weekly after each stage ships.

## 8. Open questions

- [ ] Is an undo action needed in stage 2, or is the change history enough? Default now: history only. — owner: PM, due: post-stage-1 checkpoint
- [ ] Which drag-and-drop support does the web app adopt? A new package needs approval; this is a hard-to-reverse choice. Default now: decided in architecture, with the decision recorded only once stage 2 is funded. — owner: Tech Lead, due: before stage 2 starts
- [ ] How are planners told that some weeks will show as overbooked after stage 1 ships with no change to the plan (AC-07)? Default now: a release note to the ~5 planners plus a one-time list of the newly overbooked days. — owner: PM, due: before stage 1 ships
- [ ] What evidence supports the time-of-day scope (stage 3)? The 2026-11 survey named day-by-day planning. Default now: author decision recorded in §1; source to be added. — owner: PM, due: before stage 3 starts
- [ ] How is a converted weekly rate rounded when hours per day are not a multiple of 15 minutes (e.g. 10 hours per week over 3 days)? Default now: nearest 15 minutes, with the changed allocations listed to planners. — owner: PM, due: before stage 3 starts
- [ ] How are planners told about overlaps created by the migration (every existing allocation starts at the working-day start, AC-28) and about lower totals in holiday weeks? Default now: release note plus a one-time list of overlapping days per resource. — owner: PM, due: before stage 3 ships
- [ ] Is dragging blocks on the timeline (15-minute steps) part of stage 3, or does it follow stage 2's funding? Default now: follows stage 2; stage 3 changes times through the form. — owner: PM, due: before stage 3 starts
- [ ] How does the allocation import accept times once the weekly rate is removed? Default now: import takes a start and end time per allocation; rows with a weekly rate are refused with an explanation. — owner: PM + Tech Lead, due: before stage 3 starts
