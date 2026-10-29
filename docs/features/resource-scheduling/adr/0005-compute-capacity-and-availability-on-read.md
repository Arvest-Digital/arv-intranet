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

# 0005 — Compute capacity, availability and overbooking on read in pure domain functions

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

Every board cell, free-list entry and overbooking warning is derived from inputs owned by two modules: contract hours, working days, employment period and public holidays (`org`) and allocations including leave (`scheduling`). A single input change — a new holiday, a contract-hours change — changes figures for many resource-weeks at once (AC-19c, AC-27). The PRD scale is small: 100 resources, 300 projects, 52 weeks ahead. We must decide where and when these figures are computed.

## Decision drivers

- PRD §6 calculation correctness: 100% of weekly figures match the proration rules, no intermediate rounding, overbooking judged on exact figures; verified by rule-table tests in CI.
- PRD §6 latency: board p95 ≤ 1500 ms, «who's free» p95 ≤ 1000 ms, save p95 ≤ 500 ms, at 100 resources / 300 projects / 52 weeks.
- No queries or joins across module schemas (repo ADR 0001).

## Considered options

1. **Compute on read in pure domain functions** — load raw inputs for the requested window and compute in `scheduling`'s `domain/`; store no aggregates.
2. **Stored weekly projection** — a resource × week table of capacity and allocated hours, recomputed on every change.
3. **Compute in SQL** — expand days with `generate_series` over `scheduling`'s tables and aggregate in Postgres, with `org`'s employment terms and holidays passed in as query parameters.

## Decision outcome

**Chosen:** Option 1. Figures cannot drift from their inputs, all rules live in one side-effect-free place that the rule-table tests cover directly, and the same functions serve the board, the free list, overbooking warnings and the import preview. Option 2 would make `org` edits recompute `scheduling` rows across the module boundary; option 3 would split the rules between SQL and TypeScript and make the rule-table tests need a database.

## Consequences

**Positive**
- QG-1: correctness is a property of pure functions with exhaustive table tests.
- No invalidation logic: a holiday or contract-hours change is visible on the next read.

**Negative**
- Every board or free-list request recomputes its window (100 × ~84 days ≈ 8,400 resource-days for 12 weeks) — negligible at PRD scale but proportional to resources × days.
- `scheduling` must fetch `org` inputs for the window on every read (one batched facade query, not per resource).

**Neutral**
- **TODO:** revisit this decision (consider a stored weekly projection or a cache) if the number of resources exceeds ~1,000 (10× the NFR volume) or if CPU time per board request approaches 50% of the Workers CPU limit; measure CPU time per board request in the pre-launch load test. (The 1,000-resource threshold is an architect's estimate, not a PRD number; it is mirrored in SAD §7 scaling thresholds.)

## Links

- PRD: [[../PRD.md]] §6, AC-01, AC-04, AC-08, AC-10, AC-19c, AC-27
- SAD: [[../sad.md]] §4, §7, §10
- Related ADR: [[0003-split-into-org-projects-scheduling-modules]], [[0002-render-board-ssr-with-week-window-in-url]]
