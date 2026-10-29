---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead"]
updated_at: "2026-10-29"
feature_size: M
stage: "04-05"
ticket: "TBD"
---

<!-- Format: MADR. Spawned by sdlc:architecture-design (§4 strategic decision, blast-radius 3/3). -->

# 0006 — Implement `UnitOfWork` now and keep the feature synchronous, without an outbox

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

Several operations write in more than one place and must succeed or fail as a whole: an allocation change and its history entry (AC-07, AC-16); closing a project in `projects` and trimming or removing its allocations in `scheduling` with history (AC-25); the all-or-nothing import that creates employee records, teams, projects and allocations across three modules (AC-30, AC-31). `@arv/kernel` defines the `UnitOfWork` and `DomainEvents` ports but neither has an implementation; `ARCHITECTURE.md` plans `UnitOfWorkLive` and the outbox «with the first real asynchronous use case».

## Decision drivers

- PRD §6: 0 lost updates when two users save the same allocation; allocation history traceable for 12 months.
- AC-31: the import is all-or-nothing.
- AC-16: a trim made by closing a project appears in the allocation's history, attributed to the user who closed it.
- Hyperdrive transactions hold one connection and must stay short with no network calls inside (§2).

## Considered options

1. **Implement `UnitOfWork` now, no events** — `db.transaction` with the transaction in a `CurrentTx` FiberRef read by `query()`; history in `scheduling`'s own table, written in the same transaction; closing a project calls the `scheduling` hook inside `projects`' unit of work (ADR-0007); the import's cross-module writes are facade commands joining the caller's unit of work.
2. **Outbox and events now** — implement the outbox, Cron relay and Queue consumers; `ProjectClosed` triggers trimming in `scheduling`; history moves to an event-fed audit module.

## Decision outcome

**Chosen:** Option 1. Every multi-write in this feature needs to be atomic and immediately visible (the overbooking check, the close-project preview, the import), which a shared transaction gives directly; no use case needs eventual delivery, so the outbox, relay, queue and inbox would be infrastructure without a consumer. Repositories already go through `query()`, so they need no change.

## Consequences

**Positive**
- Strong consistency for every write; the board never shows a half-applied close or import.
- First production implementation of `UnitOfWork` becomes the pattern for the rest of the intranet.

**Negative**
- Port calls and facade commands that share a caller's transaction tie `projects`, `org` and `scheduling` to one database; if one moves to its own database, those commands become events plus compensation (as `ARCHITECTURE.md` already notes).
- The import's transaction holds one Hyperdrive connection for its whole duration (bounded by the 2,000-row target); it must contain no network calls.

**Neutral**
- The `DomainEvents` port stays unimplemented; the outbox arrives with the first genuinely asynchronous use case.

## Links

- PRD: [[../PRD.md]] §6, AC-07, AC-07b, AC-16, AC-25, AC-30, AC-31
- SAD: [[../sad.md]] §4, §6, §8
- Related ADR: [[0003-split-into-org-projects-scheduling-modules]], [[0001-build-backend-service-and-web-frontend-surfaces]]
