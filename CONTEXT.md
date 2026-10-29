---
status: Living
updated_at: "2026-10-28"
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
- access role — a named bundle of permissions assigned to intranet users by the roles/permissions feature. NOT a job role (a job title or skill such as «QA», the sense used in the resource entry).
- allocation — a planned assignment of a resource to a project for a date range at a fixed number of hours per day or week. NOT logged time (hours actually spent, recorded after the fact) and NOT project membership (being on a project team reserves none of a resource's hours).
- availability — a resource's capacity minus their allocated hours over a period; the «who's free» filter sums it across the chosen period. NOT capacity (hours before allocations are subtracted).
- capacity — the working hours a resource has in a period: contract hours minus public holidays (leave is not subtracted here; it is booked as an allocation to a leave project). NOT availability (capacity left over after allocations) and NOT contract hours (the fixed weekly hours in the employment contract, before public holidays are subtracted).
- closed project — a project whose close date has passed and which accepts no new, changed or removed allocations; confirming a close date ends the project's later allocations on that date (the last bookable day) and removes those starting after it, while the project stays open until the end of that date; a closed project is never reopened. NOT a deleted project (its past allocations and their history remain).
- contract hours — the fixed weekly working hours from a resource's employment contract, spread evenly over the resource's working days (Monday to Friday unless set otherwise). NOT capacity (contract hours before public holidays and the employment period are applied).
- employee record — the intranet's shared record of an employee (name, team, contract hours, working days, employment period), kept separate from scheduling so other intranet features can reuse it. NOT a resource (the schedulable view of an employee) and NOT a user (an intranet login).
- employment period — the dates from a resource's start date to their end date (open-ended if no end date is set); outside it the resource's capacity is zero and no new allocations can be made. NOT leave (a temporary absence inside the employment period).
- incomplete record — an employee record missing contract hours or a start date, so the resource's capacity is unknown and they are left out of the free list. NOT a record missing a team or working days (team is optional and working days default to Monday to Friday), and NOT the stricter launch-readiness completeness KPI.
- leave — a resource's absence (annual, sick, unpaid and similar), booked in whole working days as an allocation to the leave-type project for its type (one project per type, such as «Sick leave»), each day taking the resource's full daily capacity; work hours falling on a leave day trigger an overbooking warning even when the week stays within capacity; viewers without the see-leave-reasons permission see only «away», except the resource themselves, who always sees the type of their own leave. NOT a public holiday (company-wide) and NOT the end of employment (see employment period).
- overbooking — a week in which a resource's allocated hours exceed their capacity; allowed after the user making the change confirms a warning, and highlighted on the schedule board. NOT a double booking (two allocations that together still fit within capacity).
- permission — a named right to perform one scheduling action (view the whole board, edit allocations, manage employee records, manage projects, manage the holiday list, see leave reasons), granted to intranet users by the roles/permissions feature; edit allocations includes everything view the whole board allows, and no other permission implies another. NOT an access role (a named bundle of permissions).
- project — anything a resource's hours can be booked against: client work, internal work, bench, training and leave. NOT client (the customer organisation; one client can have many projects).
- public holiday — a company-wide non-working date on the single holiday list; on a resource's working day it removes that day's hours from both capacity and allocations. NOT leave (an individual absence booked as an allocation).
- resource — an employee whose working hours can be allocated to projects. NOT a user (an intranet login; a resource may have no account) and NOT a role (a job title or skill such as «QA», not a specific schedulable person).
- team — a named group of resources under one team lead (a resource), kept on a list maintained by holders of the manage-employee-records permission and used to filter the schedule board; each resource belongs to at most one team. NOT a project (team membership books no hours) and NOT a permission scope (in the MVP permissions are not limited to a team).
