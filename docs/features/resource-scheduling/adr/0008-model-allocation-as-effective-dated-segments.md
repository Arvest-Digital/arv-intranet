---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead"]
updated_at: "2026-10-29"
feature_size: M
stage: "04-05"
ticket: "TBD"
---

<!-- Format: MADR. Spawned by sdlc:architecture-design (§5 building-block decision, blast-radius 2/3: irreversible + legitimate alternative). -->

# 0008 — Model an allocation as one aggregate of effective-dated segments

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

Past plans are never rewritten (AC-09b): changing an allocation that runs 1 October–30 November from 20 to 10 hours per week on 28 October keeps 1–27 October at 20 hours and applies 10 hours from today; removing it keeps the past booked; closing a project ends allocations on the close date (AC-25). At the same time, a user sees and edits «the allocation» as one thing: its history lists every change in order (AC-16), it shows who last changed it (AC-07), and two users editing it concurrently must be detected on it (AC-07b). This is the core table of the feature and the shape of its API.

## Decision drivers

- AC-09b, AC-25 — past is immutable; changes and trims take effect from a date.
- AC-07, AC-07b, AC-16 — one identity for history, last-changed-by and concurrency.
- QG-1 (SAD §1) — figures computed exactly from what was planned for each day (ADR-0005).

## Considered options

1. **One allocation with effective-dated segments** — the allocation (id, resource, project, version, last changed by/at) holds an ordered list of segments (from, to, hours per day or per week); a change from today ends the current segment yesterday and starts a new one today.
2. **Split into two allocations** — a change from today ends the old allocation yesterday and creates a new allocation linked to it (`previousId`).

## Decision outcome

**Chosen:** Option 1. «The allocation» keeps one identity for history, version and UI, and «the past is immutable» becomes an invariant of one aggregate (segments ending before today cannot change), testable in the pure domain. Option 2 scatters one plan across a chain of rows, so history, the concurrency check and an already-open edit dialog would all have to follow the chain.

## Consequences

**Positive**
- History entries, the optimistic-concurrency version and «last changed by» attach to one id.
- Removal and project-close trims are the same operation (end the last segment at a date; drop segments that start after it).

**Negative**
- Two tables (`allocations`, `allocation_segments`) instead of one; every read of hours walks the segments.
- The API exposes segments (or a «current terms + past segments» view) rather than a single flat date range.

**Neutral**
- Leave is an allocation to a leave-type project and uses the same model (booked in whole working days).

## Links

- PRD: [[../PRD.md]] AC-07, AC-07a, AC-07b, AC-09b, AC-16, AC-25
- SAD: [[../sad.md]] §5, §8
- Related ADR: [[0005-compute-capacity-and-availability-on-read]], [[0006-implement-unit-of-work-without-outbox]]
