---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead"]
updated_at: "2026-10-29"
feature_size: M
stage: "04-05"
ticket: "TBD"
---

<!-- Format: MADR. Spawned by sdlc:architecture-design (§4 strategic decision, blast-radius 3/3). Resolves PRD §8 «Is the employee record its own module». -->

# 0003 — Split the feature into `org`, `projects` and `scheduling` modules

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

Resource scheduling is the first business feature on the intranet and the first to need shared records of employees and projects; PRD §2 makes those records a goal in their own right («the intranet gains its first reusable employee and project records»), and PRD §8 asks whether the employee record is its own module. Each module is a package with its own Postgres schema, reached only through its facade, with no cross-schema joins or foreign keys (repo ADR 0001). Moving tables between schemas after launch means a data migration, so the split is the least reversible choice in this feature.

## Decision drivers

- PRD §2 goal 3: reusable employee and project records with permission-based ownership.
- `ARCHITECTURE.md` module catalog already expects an `org` (people, departments) module calling `identity`.
- The module graph must stay acyclic (`pnpm check:modules`).
- Capacity-changing edits (AC-19c, AC-27) and project closing (AC-25) need scheduling data at the moment the other module saves.

## Considered options

1. **`org` + `scheduling`** — employee records, teams and holidays in `org`; projects, allocations, capacity, history and import in `scheduling`.
2. **One `scheduling` module** — everything in one module; extract `org` later.
3. **`org` + `projects` + `scheduling`** — projects in their own module as well.

## Decision outcome

**Chosen:** Option 3. Employee records *and* projects become independent, reusable records, matching PRD §2's goal for both; a later time-tracking, staffing or reporting feature can depend on `projects` without depending on scheduling. Module edges: `org → identity`, `scheduling → org`, `scheduling → projects`. `projects` calls no other module.

## Consequences

**Positive**
- `org` and `projects` are reusable by later intranet features without pulling in scheduling.
- Ownership is clear: each of the six permissions belongs to exactly one module (`org`: manage-employee-records, manage-holiday-list; `projects`: manage-projects; `scheduling`: view-whole-board, edit-allocations, see-leave-reasons).

**Negative**
- Two operations run «backwards» against the graph: an `org` edit that changes capacity must preview overbooking computed by `scheduling` (AC-19c, AC-27), and closing a project in `projects` must preview and trim `scheduling`'s allocations (AC-25). Both need a mechanism that does not add a cycle (decided in SAD §5).
- Three modules mean three schemas, three facades, three registrations in `composition.ts`, `index.ts`, the module graph and `schemaFilter`, and three web feature folders.
- The board joins data from three modules in application code (no cross-schema SQL).

**Neutral**
- Leave-type projects live in `projects` like any other project; hiding their names from viewers without see-leave-reasons is `scheduling`'s job when it presents them (SAD §8).

## Links

- PRD: [[../PRD.md]] §2, §8, AC-19c, AC-25, AC-27
- SAD: [[../sad.md]] §4, §5
- Related ADR: [[0004-resolve-permissions-into-actor-per-request]], [[0006-implement-unit-of-work-without-outbox]]
