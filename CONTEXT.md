---
status: Living
updated_at: "2026-10-27"
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
- allocation — a planned assignment of a resource to a project for a date range at a fixed number of hours per day or week. NOT logged time (hours actually spent, recorded after the fact) and NOT project membership (being on a project team reserves none of a resource's hours).
- capacity — the working hours a resource has in a period: contract hours minus public holidays (leave is not subtracted here; it is booked as an allocation to a leave project). NOT availability (capacity left over after allocations) and NOT contract hours (the fixed weekly hours in the employment contract, before public holidays are subtracted).
- project — anything a resource's hours can be booked against: client work, internal work, bench, training and leave. NOT client (the customer organisation; one client can have many projects).
- resource — an employee whose working hours can be allocated to projects. NOT a user (an intranet login; a resource may have no account) and NOT a role (a job title or skill such as «QA», not a specific schedulable person).
