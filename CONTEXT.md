---
status: Living
updated_at: "2026-11-21"
---

# Domain Context — arv-intranet

<!--
CONTEXT.md is the domain glossary — not a PRD and not a scratch pad. NO implementation
detail here (no datastore/broker/framework names, no API contracts) — only domain words
and the boundaries between them. Implementation choices live in the SAD and ADRs;
behaviour lives in PRD.md.

Multi-context repos: each bounded context has its own CONTEXT.md at its root path
(registered in CONTEXT-MAP.md). System-wide terms that span all contexts live in the
repo-root CONTEXT.md. Never duplicate a term across files — pick one owner.

Terms get fixed inline, the moment they surface in an interview / PRD / review — never
batched «I'll consolidate later». Empty H2 → prune before commit; keep only the sections
that carry real content. ## Glossary is mandatory; the other two are optional.
-->

## Glossary

<!-- One line per term: name · one-sentence canonical definition · one-sentence boundary
     (what it is NOT / the concept it gets confused with). Alphabetical once there are a few. -->
- access list — the admin-kept list of company-domain email addresses allowed to sign in to the intranet; removing someone from it denies their next request even though their Google account keeps working. NOT the company email domain (a necessary but not sufficient check) and NOT an access role (what a user may do once signed in).
- access role — a named bundle of permissions that admins compose and assign to users on the access list; a user may do what any of their access roles allows. NOT a job role (a job title or skill such as «QA», the sense used in the resource entry).
- admin — a user who holds the manage-access permission through an access role, which lets them add and remove users on the access list, compose access roles from permissions and assign them; there are 1–2, the first is seeded from configuration only while no admin exists, and the last one cannot lose admin rights. NOT a team lead or planner (who may hold scheduling permissions without managing access).
- allocation — a planned assignment of a resource to a project for a date range at one fixed time interval per day, except leave, which has no time interval (until stage 3 of the schedule day view ships: a fixed number of hours per day or week). NOT logged time (hours actually spent, recorded after the fact) and NOT project membership (being on a project team reserves none of a resource's hours).
- availability — a resource's capacity minus their allocated hours over a period; the «who's free» filter sums it across the chosen period. NOT capacity (hours before allocations are subtracted).
- capacity — the working hours a resource has in a period: contract hours minus public holidays (leave is not subtracted here; it is booked as an allocation to a leave project). NOT availability (capacity left over after allocations) and NOT contract hours (the fixed weekly hours in the employment contract, before public holidays are subtracted).
- closed project — a project whose close date has passed and which accepts no new, changed or removed allocations; confirming a close date ends the project's later allocations on that date (the last bookable day) and removes those starting after it, while the project stays open until the end of that date; a closed project is never reopened. NOT a deleted project (its past allocations and their history remain).
- contract hours — the fixed weekly working hours from a resource's employment contract, spread evenly over the resource's working days (Monday to Friday unless set otherwise). NOT capacity (contract hours before public holidays and the employment period are applied).
- daily capacity — a resource's capacity on one date: their contract hours divided evenly over their working days, or zero on a non-working day, a public holiday or a date outside their employment period; a day whose allocated hours exceed it is overbooked. NOT contract hours (weekly hours before working days and holidays are applied) and NOT availability (what is left after allocations).
- day view — a zoom of the schedule board that shows one to four weeks with a column per day: each resource's allocated hours against their daily capacity, plus leave days and public holidays. NOT a per-day plan (an allocation has one fixed rate per day or week — from stage 3, one fixed time interval per day — so its hours are the same on every working day it covers) and NOT the timeline (one day on a time-of-day axis).
- employee record — the intranet's shared record of an employee (name, team, contract hours, working days, employment period), kept separate from scheduling so other intranet features can reuse it. NOT a resource (the schedulable view of an employee) and NOT a user (an intranet login).
- employment period — the dates from a resource's start date to their end date (open-ended if no end date is set); outside it the resource's capacity is zero and no new allocations can be made. NOT leave (a temporary absence inside the employment period).
- incomplete record — an employee record missing contract hours or a start date, so the resource's capacity is unknown and they are left out of the free list. NOT a record missing a team or working days (team is optional and working days default to Monday to Friday), and NOT the stricter launch-readiness completeness KPI.
- leave — a resource's absence (annual, sick, unpaid and similar), booked in whole working days as an allocation to the leave-type project for its type (one project per type, such as «Sick leave»), each day taking the resource's full daily capacity; work hours falling on a leave day trigger an overbooking warning even when the week stays within capacity; leave has no time interval: on the timeline it fills the resource's current working hours, and it is never part of a time overlap; viewers without the see-leave-reasons permission see only «away», except the resource themselves, who always sees the type of their own leave. NOT a public holiday (company-wide) and NOT the end of employment (see employment period).
- overbooking — a week in which a resource's allocated hours exceed their capacity, or a day in which they exceed the resource's daily capacity; a week containing an overbooked day is itself overbooked; allowed after the user making the change confirms a warning that names the affected weeks and days, and highlighted on the schedule board. NOT a double booking (two allocations that together still fit within capacity on every day of the week).
- permission — a named right to perform one action in an intranet feature, declared by the feature that checks it and granted to users only through access roles; at launch these are identity's manage access and scheduling's six (view the whole board, edit allocations, manage employee records, manage projects, manage the holiday list, see leave reasons); edit allocations includes everything view the whole board allows, and no other permission implies another. NOT an access role (a named bundle of permissions).
- project — anything a resource's hours can be booked against: client work, internal work, bench, training and leave. NOT client (the customer organisation; one client can have many projects).
- public holiday — a company-wide non-working date on the single holiday list; on a resource's working day it removes that day's hours from both capacity and allocations. NOT leave (an individual absence booked as an allocation).
- resource — an employee whose working hours can be allocated to projects. NOT a user (an intranet login; a resource may have no account) and NOT a role (a job title or skill such as «QA», not a specific schedulable person).
- retired permission — a permission that an access role still grants but that no feature declares any more, because it was renamed, split or removed; admins see it flagged on the affected roles and it grants nothing. NOT a permission the user simply lacks (one that is still declared but not granted to them).
- team — a named group of resources under one team lead (a resource), kept on a list maintained by holders of the manage-employee-records permission and used to filter the schedule board; each resource belongs to at most one team. NOT a project (team membership books no hours) and NOT a permission scope (in the MVP permissions are not limited to a team).
- time interval — the daily start and end time of an allocation other than leave, in 15-minute steps and at most 24 hours, the same on every working day the allocation covers; its length is the allocation's hours per day. NOT working hours (the resource's own working span; an interval may fall partly or wholly outside it).
- time overlap — a stretch of time on one day when two allocations of the same resource both fall, because their time intervals cross; allowed after the user making the change confirms a warning naming the day, the times and both projects, and marked on the timeline. NOT overbooking (too many hours in a day or week, whatever the times; an overlap can happen inside daily capacity) and NOT a double booking (two allocations on one day at times that do not cross).
- timeline — a one-day view of the schedule board on a time-of-day axis, opened from the day view, always grouped by resource: each resource's working hours, their allocations as blocks at their time intervals, leave and time overlaps. NOT the day view (one to four weeks with a column per day and no times of day).
- user — a person on the access list who signs in to the intranet with their company-domain Google account and holds zero or more access roles. NOT a resource (a schedulable employee, who may have no login) and NOT an employee record (the shared HR-style record of an employee).
- working hours — the one continuous span of a resource's working day, from their working-day start (on the employee record, 09:00 unless set otherwise) to that start plus their daily capacity; booking outside it is allowed and only marked on the timeline. NOT capacity (how many hours a resource has, not when) and NOT contract hours (weekly hours from the contract, with no time of day).
