---
status: Approved
owner: "dmitro.b"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-28"
feature_size: "M"
stage: "03"
ticket: "TBD"
---

# PRD — resource-scheduling

> **Inputs (required):** [idea-brief](./idea-brief.md) · [CONTEXT](../../../CONTEXT.md) (repo-root glossary; this repo is single-context)
> **Reference module:** N/A — green-field mode (no business module has shipped yet).
> **External context channels used:** architecture context: [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) (no `docs/architecture-map.md` yet). Otherwise none — only CONTEXT + idea-brief.

Domain terms (**resource**, **allocation**, **capacity**, **availability**, **contract hours**, **employment period**, **employee record**, **incomplete record**, **project**, **closed project**, **leave**, **public holiday**, **overbooking**, **team**, **permission**, **access role**, **user**) follow [`CONTEXT.md`](../../../CONTEXT.md).

## 1. Context

Planning who works on what lives in a spreadsheet and in tracker tickets, with no combined view per person. The ~5 people who plan (PMs, delivery managers and team leads) cannot answer «who is free in the next 2 weeks?» without about an hour of chat, because nobody can see a resource's allocations against their capacity. Overbooking and bench time are noticed only after the fact. The ~30 scheduled employees have their weeks decided by this plan but cannot see it in one place.

This is strategic, not incident-driven. The intranet is being built to join interconnected internal capabilities (people, leave, projects) in one place instead of buying more tools linked by integrations. Resource scheduling is the first business feature on it and the first to need a shared record of employees and projects.

We commit to the **Team Availability Board** (idea-brief §13, Approach C): a weekly board of resources by week showing allocated hours against capacity, with a «free hours over the next N weeks» filter, leave booked as a project, a single public-holiday list, employee records kept separate from scheduling so later intranet features reuse them, a one-time import from the planning spreadsheet, and a change history on allocations covering the last 12 months. Who may do what is decided by named permissions granted through a separate roles/permissions feature, not by job title.

Traceability:
- Raw idea (baseline, verbatim from idea-brief §1): «It's difficult to plan and allocate resources within the team. It's unclear who is working on which projects and how busy they are. We need to set up a scheduling system so we can see and manage this.»
- `ARCHITECTURE.md` (Module catalog): the intranet today has only a user-accounts capability; a people/departments capability is listed as expected but not built. Employee records therefore start empty and are filled by the one-time import plus manual completion.
- Interview decisions (2026-10-28, hard depth): permission-based authorization from a separate feature, global permission scope in the MVP; overbooking allowed with a warning; partial weeks prorated by working days; one company-wide holiday list; own-schedule visibility by default; «who's free» sums availability over the period; closing a project trims later allocations; allocations outside the employment period blocked; import previewed and all-or-nothing; allocation history kept for 12 months.

## 2. Goals

- The people who plan (PMs, delivery managers and team leads) trust one always-current view of who is booked on what against real capacity, so the planning spreadsheet is retired rather than run alongside.
- «Who is free in the next N weeks?» is answered from a single filtered view instead of a round of chat.
- The intranet gains its first reusable employee and project records, with permission-based ownership and every allocation change of the last 12 months traceable to who made it and when.

## 3. Non-goals

- **Time tracking** (logged time, plan versus actual) — a different job from planning; out of scope per idea-brief §5.
- **Skills and search by skill; finances** (rates, budgets, margin) — not needed to answer «who is free», and finance depth is what made bought tools a poor fit.
- **Drag-and-drop day-level editing, scenarios, what-if planning** — the board is weekly; these would consume the whole schedule budget.
- **Tracker sync** — bench, training and leave do not exist in the tracker; a project-list import may follow after launch.
- **Managing access roles and permissions** — a separate prerequisite feature owns this; scheduling only names the six permissions it needs.
- **Team-scoped permissions, several holiday calendars, leave approval** — kept out to fit the deadline: permissions apply to all resources (changes stay traceable through history), one company holiday list applies to everyone (other countries' holidays are booked as leave), and leave is approved elsewhere and then booked here.
- **Reopening a closed project, half-day leave** — kept out of the MVP: a closed project stays closed (a new project is created instead), and leave is booked in whole working days.

## 4. User stories

### US-01: View the schedule board
**As a** user with the view-whole-board permission
**I want** to see every resource's allocated hours against capacity for each week, marked free, partly booked or overbooked, and narrow it by team or project
**So that** I know who is busy without asking around

### US-02: Find who is free
**As a** user with the view-whole-board permission
**I want** to list resources whose total availability over the next N weeks is at least X hours, most free first
**So that** I can answer «who is free?» in under a minute

### US-03: Plan an allocation
**As a** user with the edit-allocations permission
**I want** to create, change and remove a resource's allocation to an open project for a date range at a number of hours per day or per week
**So that** the plan always reflects current decisions

### US-04: Book leave
**As a** user with the edit-allocations permission
**I want** to book a resource's leave in whole working days as an allocation to the leave-type project for its type (for example «Annual leave», «Sick leave»)
**So that** nobody plans the resource onto work while they are away

### US-05: Trace allocation changes
**As a** user with the view-whole-board permission
**I want** to see who last changed each allocation and when, and its full history of changes
**So that** conflicting edits between users who plan can be traced and settled

### US-06: See my own schedule
**As a** resource with an intranet login
**I want** to see my own allocations and leave week by week against my capacity
**So that** I know what I am planned on without asking

### US-07: Keep employee records accurate
**As a** user with the manage-employee-records permission
**I want** to create a resource's employee record, link it to their intranet login, and set their team, contract hours, working days and employment period, and maintain the list of teams and their team leads
**So that** capacity, and with it every availability figure, is correct

### US-08: Manage projects
**As a** user with the manage-projects permission
**I want** to create projects of each type (client, internal, bench, training, leave) and close them when they end
**So that** allocations are booked against a current list without duplicates

### US-09: Maintain the holiday list
**As a** user with the manage-holiday-list permission
**I want** to add and remove public holidays on the single company list
**So that** capacity reflects the days nobody works

### US-10: Keep leave reasons private
**As a** user with the see-leave-reasons permission
**I want** to see the type of a resource's leave, while everyone else sees only «away»
**So that** sensitive absence details such as sick leave stay private

### US-11: Import the planning spreadsheet
**As a** user with the edit-allocations, manage-employee-records and manage-projects permissions
**I want** to preview and then import the planning spreadsheet once
**So that** the board starts from the current plan and the spreadsheet can be retired

## 5. Acceptance criteria

### AC-01 (US-01) — happy path
**Given** a user with the view-whole-board permission, and resources with allocations and complete employee records over the coming weeks
**When** the user opens the schedule board
**Then** the user sees one row per resource whose employment period overlaps the shown weeks and one column per week — by default the current week and the 11 following, with scrolling back up to 12 months (view only) and forward up to 52 weeks — each cell showing allocated hours against capacity in exactly one state: free (nothing allocated, capacity above zero), partly booked (allocated above zero and at most capacity, so a fully booked week shows for example «40/40»), overbooked (allocated above capacity), non-working (capacity zero and nothing allocated) or incomplete record (AC-06); a week with leave also shows «away» with the number of leave days, next to the hours

### AC-02 (US-01) — happy path
**Given** a user with the view-whole-board permission is on the schedule board
**When** the user narrows the board to one team or one project
**Then** only resources in that team, or with an allocation to that project in the shown weeks, remain on the board, with the same weekly figures

### AC-03 (US-01) — authorization
**Given** a user with neither the view-whole-board nor the edit-allocations permission
**When** the user tries to open the schedule board
**Then** the system does not show any other resource's schedule and, if the user is a resource, offers their own schedule instead

### AC-04 (US-02) — happy path
**Given** a user with the view-whole-board permission and resources with complete employee records
**When** the user asks for resources with at least 16 free hours in total over the next 2 weeks
**Then** the system counts the remaining working days of the current week starting today plus the next full week (for N weeks in general: the rest of the current week plus the next N−1 full weeks, matching the board's week columns; «today» is the date in the company's single time zone), and lists every resource whose summed availability over that period is at least 16 hours, most free first, showing each resource's free hours per week; an overbooked week counts as zero in the sum, never as negative availability

### AC-05 (US-02) — error
**Given** a user with the view-whole-board permission
**When** the user asks for a number of weeks outside 1 to 12, or a minimum of free hours that is negative or not a number
**Then** the system shows no results and tells the user that the number of weeks must be from 1 to 12 and the free hours must be zero or more

### AC-06 (US-02) — domain invariant
**Given** a resource whose employee record has no contract hours or no start date yet
**When** any user views the schedule board or asks who is free
**Then** the resource is marked «incomplete record» on the board and left out of the free list, with a note that their capacity is unknown; working days default to Monday to Friday and the team is optional (a resource without one is grouped under «no team»), so neither makes a record incomplete

### AC-07 (US-03) — happy path
**Given** a user with the edit-allocations permission, an open project, and a resource whose employment period covers the dates
**When** the user allocates the resource to the project at 20 hours per week for a date range
**Then** the system records the allocation, the board shows its hours in each week of the range, and the allocation shows the user as last changed by, with the time

### AC-07a (US-03) — happy path
**Given** a user with the edit-allocations permission and an existing allocation running over the next 4 weeks
**When** the user removes the allocation
**Then** its hours disappear from the board and count as availability again, and the removal stays in the allocation's history with who removed it and when

### AC-07b (US-03) — concurrent edit
**Given** two users with the edit-allocations permission have opened the same allocation
**When** both save different changes, one after the other
**Then** the system keeps the first change, refuses the second, and tells the second user that the allocation was changed meanwhile by the first user, showing the current values

### AC-08 (US-03) — domain invariant
**Given** a resource who works Monday to Friday, and a public holiday on a Thursday
**When** a user with the edit-allocations permission allocates the resource at 40 hours per week starting on a Wednesday
**Then** the board shows 24 hours in the starting week and 32 hours in the week with the holiday, because allocation hours follow the resource's working days and skip public holidays

### AC-09 (US-03) — error
**Given** a user with the edit-allocations permission is creating or changing an allocation
**When** the end date is before the start date, or the hours are zero, negative, not a multiple of a quarter hour, more than 24 per day, or more than 24 per week for each of the resource's working days
**Then** the system does not save the allocation and tells the user which of these rules the input breaks

### AC-09b (US-03) — domain invariant
**Given** an allocation running from 1 October to 30 November, and today is 28 October
**When** a user with the edit-allocations permission changes its hours from 20 to 10 per week, or removes it
**Then** the change applies only from today: 1 to 27 October keep 20 hours per week (or stay booked, for a removal), and the history shows the change taking effect today; a new allocation, or a changed start date, before today is refused with the explanation that past plans are not rewritten; the same rule applies to leave

### AC-10 (US-03) — domain invariant
**Given** a resource with 32 hours of capacity and 24 hours already allocated in a week
**When** a user with the edit-allocations permission adds a 16-hour allocation covering that week
**Then** the system warns that the resource will be overbooked, listing every affected week of the allocation with the hours over capacity in each (here 8 hours in that week), saves only after the user confirms, and the board then marks those weeks as overbooked

### AC-11 (US-03) — domain invariant
**Given** a closed project (its close date has passed, see AC-25)
**When** a user with the edit-allocations permission tries to allocate a resource to it, or to change or remove one of its existing allocations
**Then** the system does not save the change and tells the user that the project is closed and accepts no new, changed or removed allocations

### AC-12 (US-03) — authorization
**Given** a user without the edit-allocations permission
**When** the user tries to create, change or remove any allocation
**Then** the system refuses, tells the user they lack the permission to edit allocations, and the plan stays unchanged

### AC-12b (US-03) — authorization
**Given** a user whose access role grants the edit-allocations permission but not the view-whole-board permission
**When** the user opens the schedule board, the free list or an allocation's history
**Then** the user sees them as a holder of the view-whole-board permission would, because the edit-allocations permission includes everything the view-whole-board permission allows

### AC-13 (US-03) — cross-context
**Given** a resource whose employee record sets the end of their employment period on the 15th of the month
**When** a user with the edit-allocations permission tries to allocate the resource for a date range that extends past the 15th
**Then** the system does not save any part of the allocation and tells the user that it falls outside the resource's employment period, naming the 15th as the last date the resource can be allocated

### AC-14 (US-03) — cross-context
**Given** a user whose access role no longer grants the edit-allocations permission, changed in the roles and permissions feature after the user opened the board
**When** the user next tries to save an allocation
**Then** the system refuses as if the user never had the permission, because permissions are checked at the moment of each action

### AC-15 (US-04) — happy path
**Given** a user with the edit-allocations permission and a leave-type project
**When** the user books 5 working days of annual leave for a resource
**Then** each of those days takes the resource's full daily capacity (contract hours divided by their working days) as allocated, the resource shows as «away» on the board for those days, and the resource is not counted as free for them; if any work allocation's hours (spread over the resource's working days) fall on a leave day, the overbooking warning names those allocations so the user can shorten or move them, even when the week's total stays within capacity; the leave type is the leave-type project chosen, such as «Annual leave»

### AC-16 (US-05) — happy path
**Given** an allocation that was created by one user, changed by another, and later trimmed when its project closed
**When** a user with the view-whole-board permission opens the allocation's history
**Then** the user sees every change of the last 12 months in order with who made it, when, and the values before and after, including the creation and the trim; the trim is attributed to the user who closed the project, and an allocation created by the import shows the importing user and «imported» as its first entry while that entry is within the 12 months

### AC-17 (US-06) — happy path
**Given** a user who is a resource and has no view-whole-board permission
**When** the user opens their own schedule
**Then** the user sees their own allocations and leave, including their own leave type, week by week against their capacity, and cannot change any of them

### AC-18 (US-06) — cross-context
**Given** a user whose intranet login is not linked to any employee record
**When** the user opens their own schedule
**Then** the system tells the user they are not set up as a resource yet and that someone with the manage-employee-records permission can link them

### AC-19a (US-07) — happy path
**Given** a user with the manage-employee-records permission and a new joiner who is not yet on the board
**When** the user creates the joiner's employee record with a team, 40 contract hours, working days Monday to Friday and a start date next Monday, and links it to the joiner's intranet login
**Then** the resource appears on the board from next Monday with 40 hours of capacity per full week, and the joiner can open their own schedule

### AC-19b (US-07) — domain invariant
**Given** an intranet login that is already linked to one employee record
**When** a user with the manage-employee-records permission tries to link the same login to a different employee record
**Then** the system does not link it and tells the user which employee record the login is already linked to, because one login belongs to exactly one employee record

### AC-19 (US-07) — happy path
**Given** a user with the manage-employee-records permission
**When** the user sets a resource's contract hours to 24 per week with working days Monday to Wednesday
**Then** the system records it, the resource's capacity becomes 8 hours on each of those days and 24 hours per full week, and the board and free list use the new capacity

### AC-19c (US-07) — domain invariant
**Given** a resource with 40 hours of capacity and 32 hours allocated in a coming week
**When** a user with the manage-employee-records permission sets the resource's contract hours to 24, or a user with the manage-holiday-list permission adds a holiday that pushes a resource's week over capacity
**Then** before saving, the system lists every resource and week that would become overbooked and saves only after the user confirms; the allocations themselves do not change, so no allocation history entry is written

### AC-19d (US-07) — happy path
**Given** a user with the manage-employee-records permission
**When** the user creates a team «Platform» with a resource as its team lead, renames it, creates another team named «platform », or tries to remove a team that still has resources
**Then** creating and renaming are saved; the duplicate name is refused because team names are compared like project names (AC-24); and removing a team that still has resources is refused, naming how many resources are still in it

### AC-20 (US-07) — error
**Given** a user with the manage-employee-records permission is editing an employee record
**When** the contract hours are zero, negative or more than 60 per week, no working day is selected, or the end date is before the start date
**Then** the system does not save the record and tells the user which of these rules the input breaks

### AC-21 (US-07) — domain invariant
**Given** a resource with allocations running past the 15th of next month
**When** a user with the manage-employee-records permission sets the end of the resource's employment period to the 15th
**Then** the system saves the record, keeps the later allocations, and marks them on the board as needing attention because they fall outside the employment period

### AC-21b (US-07) — domain invariant
**Given** a resource whose employment period ends on the 15th, and an allocation marked as needing attention that runs to the 30th
**When** a user with the edit-allocations permission shortens the allocation to end on or before the 15th, removes it, or makes any other change that leaves it running past the 15th
**Then** the shortening or removal is saved and the mark disappears, while the other change is refused as in AC-13; until it is fixed, the weeks past the 15th show as needing attention rather than overbooked, and the resource is not counted as free in them

### AC-22 (US-07) — authorization
**Given** a user without the manage-employee-records permission
**When** the user tries to change any part of an employee record
**Then** the system refuses, tells the user they lack the permission to manage employee records, and the record stays unchanged; and a user who holds neither the manage-employee-records nor the edit-allocations permission never sees a resource's employment end date or the needing-attention marks, only zero capacity after it; for those viewers, allocations past the end date are not shown and those weeks are not marked overbooked

### AC-23 (US-08) — happy path
**Given** a user with the manage-projects permission
**When** the user creates a client project with a name that no open project uses
**Then** the system records the project as open and it becomes available for new allocations

### AC-24 (US-08) — domain invariant
**Given** an open project named «Atlas»
**When** a user with the manage-projects permission creates another project named «atlas » (different letter case and a trailing space)
**Then** the system does not create it and tells the user that an open project with this name already exists, because project names are compared ignoring letter case and leading or trailing spaces

### AC-25 (US-08) — domain invariant
**Given** an open project with 3 allocations that run past the chosen close date
**When** a user with the manage-projects permission closes the project
**Then** the system lists the 3 allocations that will end at the close date and any allocations starting after it, which will be removed; after the user confirms it ends those allocations on the close date (the last day that can still be booked), removes the later ones, records the trims and removals in their history attributed to the user who closed the project, and the freed hours show as availability; the project stays open until the end of the close date, so its allocations can still be changed but not past that date, and becomes closed after it; a close date earlier than today is refused, so past plans are never rewritten

### AC-26 (US-08) — authorization
**Given** a user without the manage-projects permission
**When** the user tries to create or close a project
**Then** the system refuses, tells the user they lack the permission to manage projects, and the project list stays unchanged

### AC-27 (US-09) — happy path
**Given** a user with the manage-holiday-list permission, a full-time resource working Monday to Friday, and a part-time resource working Wednesday to Friday
**When** the user adds a public holiday on a Monday
**Then** the full-time resource's capacity and allocated hours for that week drop by that Monday's hours, and the part-time resource's week is unchanged; if the holiday makes any resource's week overbooked, the warning of AC-19c is shown first

### AC-28 (US-09) — authorization
**Given** a user without the manage-holiday-list permission
**When** the user tries to add or remove a public holiday
**Then** the system refuses, tells the user they lack the permission to manage the holiday list, and the list stays unchanged

### AC-29 (US-10) — authorization
**Given** a resource on sick leave next week, one viewer with the see-leave-reasons permission and one without it, both able to see the resource's schedule
**When** each viewer looks at the board, the free list and the history of that leave
**Then** the first viewer sees «sick leave», and the second sees only «away» everywhere, with no leave type or leave project name shown, and leave-type projects are not offered to the second viewer when narrowing the board by project; a user who books leave chooses its type (the leave-type project) while booking but afterwards sees it, like everyone else, as «away» unless they hold the see-leave-reasons permission; the only exception is the resource themselves, who always sees the type of their own leave

### AC-30 (US-11) — happy path
**Given** a user with the edit-allocations, manage-employee-records and manage-projects permissions, and a spreadsheet file with no problem rows
**When** the user uploads it for preview and then confirms
**Then** the preview shows how many employee records, projects and allocations will be created, how many employee records will still be incomplete, and which resource-weeks will be overbooked; one confirmation covers all of them, after which everything is created and the board shows the imported plan

### AC-31 (US-11) — error
**Given** a spreadsheet with rows that have empty hours, end dates before start dates, or names that look like different spellings of the same person or project (differing only in initials, letter case or spaces)
**When** the user uploads it for preview
**Then** the preview lists each problem row with its reason, nothing is imported, and the user is asked to fix the spreadsheet and try again; rows are checked against the same rules as manual entry (AC-09, AC-13, AC-20), while overbooking is allowed and only shown in the preview (AC-30)

### AC-32 (US-11) — domain invariant
**Given** an import has already completed successfully
**When** any user tries to import a spreadsheet again
**Then** the system does not offer a second import and explains that the import is one-time, so later changes are made on the board

### AC-33 (US-11) — authorization
**Given** a user who lacks any one of the edit-allocations, manage-employee-records or manage-projects permissions
**When** the user tries to import the spreadsheet
**Then** the system refuses and names the permissions the user is missing

## 6. Non-functional requirements

| Aspect | Target | Measurement |
|---|---|---|
| Latency p95, open the schedule board (100 resources × 12 weeks) | ≤ 1500 ms | server request-duration metric for the board view, production |
| Latency p95, «who's free» result | ≤ 1000 ms | server request-duration metric for the free-list query, production |
| Latency p95, save an allocation (incl. overbooking check) | ≤ 500 ms | server request-duration metric for allocation saves, production |
| Import preview, spreadsheet up to 2,000 rows | ≤ 10 s | timed in the pre-launch import rehearsal |
| Scale headroom | targets above hold at 100 resources, 300 projects, 52 weeks ahead | load test seeded at those volumes before launch |
| Availability | 99.5% monthly | intranet uptime monitor, monthly SLO window |
| Calculation correctness | 100% of weekly figures match the proration rules (partial weeks, holidays, part-timers, employment period); figures are computed without intermediate rounding, shown rounded to the nearest half hour, and overbooking is judged on the exact figures | automated rule-table tests in CI |
| Concurrency | 0 lost updates when two users save the same allocation | automated concurrent-save test in CI (see AC-07b) |
| History retention | allocation history entries kept for 12 months, then deleted | monthly retention job report |
| Accessibility | free, partly booked and overbooked are distinguishable without colour; text contrast ≥ 4.5:1 | automated accessibility audit of the board in CI |

## 6.1 Security / privacy

- **Data classification:** confidential — named employees' workload, employment dates and absences; sick leave is health-related.
- **Personal data touched:** employee name, team, contract hours, working days, employment start and end dates (all internal, moderate sensitivity); leave type (high sensitivity for sick leave); user-to-employee link; allocation history with user names and times.
- **AuthZ/AuthN impact:** six new permissions — view whole board, edit allocations, manage employee records, manage projects, manage holiday list, see leave reasons — granted through access roles of the separate roles/permissions feature and checked at every action; deny by default. The edit-allocations permission includes everything the view-whole-board permission allows (AC-12b); no other permission implies another. Any signed-in user who is a resource sees only their own schedule. All permissions apply to all resources in the MVP.
- **Abuse cases:**
  - Browsing colleagues' schedules without the view-whole-board permission: only the user's own schedule is shown; other resources are neither listed nor counted.
  - Sick-leave leak through a side door (free list, history, project names, search): leave type is hidden in every view for viewers without the see-leave-reasons permission; they see «away» only. The only exception is the resource themselves, who always sees the type of their own leave (AC-17).
  - Unannounced departure leaking through the schedule: the employment end date and the marks on allocations past it are shown only to holders of the manage-employee-records or edit-allocations permission; everyone else sees only zero capacity, with no allocations and no overbooking shown after it (AC-22).
  - Injection through project names, team names or spreadsheet cells: all such text is stored and shown as plain text, never interpreted; formula-like cells are imported as text.
  - Bulk tampering by a holder of edit-allocations: every change is attributed in history; more than 120 allocation changes per minute by one user are refused with an explanation. The import and closing a project each count as one change, since both need explicit confirmation and are recorded in full in history.
  - Stale permission after an access-role change: permissions are checked at the moment of each action, not at sign-in (AC-14).
- **Security review:** Required — new authorization boundary (six permissions) and health-related personal data (sick leave).

## 7. Metrics / KPIs

- **Time to answer «who is free in the next 2 weeks?»** — baseline: ~60 min (interview, idea-brief §2), re-measured with the same timed task before launch; target: median ≤ 1 min within 6 weeks of launch, measured by that timed task with the ~5 users who plan at weeks 2 and 6.
- **Planning spreadsheet retired** — baseline: 1 live spreadsheet edited weekly, target: archived read-only by week 6 after launch, with 0 edits after archiving.
- **Adoption by users with the edit-allocations permission** — baseline: 0 of ~5 plan in the intranet, target: every one of them who is not on leave that week changes at least one allocation in the intranet weekly from week 4 after launch, measured from allocation history.
- **Employee-record completeness** — baseline: 0% (no employee records exist), target: 100% of resources with contract hours, working days, start date and team before launch (a data-readiness launch gate, stricter than the «incomplete record» rule of AC-06).
- **Overbooking seen ahead of time** — baseline: noticed after the fact (≈0% ahead), target: ≥ 90% of overbooked resource-weeks first flagged at least 7 days before the week starts, from week 6 after launch, measured from allocation history.

## 8. Open questions

- [ ] When will the roles/permissions feature be ready, and does scheduling launch wait for it? Default now: scheduling launch waits for it. — owner: Tech Lead, due: before /sdlc:architecture-design
- [ ] Do changes to contract hours or working days need an effective date, so past weeks keep their old capacity? Default now: a change applies to all weeks, past and future. — owner: PM, due: before /sdlc:architecture-design
- [ ] Should intranet logins also be matched to employee records automatically (for example by work email), on top of linking by hand (US-07)? Default now: by hand only. — owner: Tech Lead, due: before /sdlc:architecture-design
- [ ] Is the employee record its own module (the planned people/departments capability) — a hard-to-reverse choice. Default now: yes, separate from scheduling. — owner: Tech Lead, due: during /sdlc:architecture-design
- [ ] What is the planning spreadsheet's exact format: file type, columns, how rows map to employee records, projects, allocations, leave and teams, and the rule for spotting different spellings of the same name (AC-31)? Default now: the PM supplies a sample of the real spreadsheet and the mapping is derived from it. — owner: PM, due: before /sdlc:architecture-design
- [ ] Should a tracker project-list import follow after launch? Default now: no, revisit if users who plan report double entry of projects. — owner: Tech Lead, due: 6 weeks after launch
