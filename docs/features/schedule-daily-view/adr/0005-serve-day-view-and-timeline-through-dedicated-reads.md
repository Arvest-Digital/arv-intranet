---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead"]
updated_at: "2026-11-22"
feature_size: L
stage: "04-05"
ticket: "BRIEFS B-01 (docs/features/resource-scheduling/BRIEFS.md)"
---

# 0005 — Serve the day view and the timeline through dedicated reads beside the board

- **Status:** Accepted
- **Date:** 2026-11-22
- **Deciders:** dmitro.b (author / PM) with the architect during the architecture-design pass

## Context

`GET /scheduling/board` returns week cells only (`BoardRow.cells: WeekFigures[]`, up to 12 weeks). Per-day figures exist in the domain but are never sent. The day view needs:
- a cell per resource-day for up to 4 weeks, with allocated hours against daily capacity, away and non-working days, and the overbooked mark;
- allocation bars spanning days.

The timeline needs one day with times, working hours and overlaps (stage 3), and stage 2 needs an outcome table per gesture ([ADR-0004](./0004-precompute-gesture-outcomes-once-per-gesture-on-the-server.md)). The PRD measures latency per request kind: the day-view request ≤ 1500 ms and the timeline request ≤ 1000 ms at p95.

## Decision drivers

- PRD §6 latency targets and their measurement: «server request-duration metric for the day-view request» and «for the timeline request».
- AC-02, AC-03, AC-21: different window limits per view (1–4 weeks; one day), with the same 12-month-back / 52-week-ahead bounds.
- Contract changes are additive (ARCHITECTURE.md). The weekly board's contract stays stable.
- Typed `hc` clients per feature keep inference fast (ARCHITECTURE.md → Web).

## Considered options

1. **Dedicated reads** — a day-view read (`from`, `weeks` 1–4, `team`, `project`), a timeline read (`date`, `team`, `project`), the own-schedule equivalents and (stage 2) the gesture-outcomes read. Each has its own DTO and window validation, and all are computed by the same domain functions.
2. **One board read with a zoom parameter** — `GET /scheduling/board?zoom=week|day|time`, returning a discriminated union whose shape depends on the parameter.

## Decision outcome

**Chosen:** Option 1. Each view gets a simple, non-polymorphic response type and its own window rule. The PRD's per-request latency metrics map one-to-one onto routes, and the weekly board's contract does not change. Option 2 puts three window rules and three latency targets behind one route and forces clients to narrow a union on every call.

## Consequences

**Positive**
- Latency per view is measurable per route in production (SAD §7).
- The web keeps one gateway function per view, and the weekly board code is untouched.

**Negative**
- Three or four more routes and DTOs in `@arv/contracts/scheduling` to maintain.
- Filter and visibility handling must be shared in `scheduling/application` rather than duplicated per route.

**Neutral**
- Grouping by project (AC-01b) stays a web-loader regrouping of the by-resource response, as on the weekly board.

## Links

- PRD: [../PRD.md](../PRD.md) §5 AC-01–AC-03, AC-12, AC-21, AC-30; §6
- SAD: [../sad.md](../sad.md) §5
- Related ADR: [0001](./0001-render-day-view-and-timeline-as-ssr-zooms-of-the-board-url.md), [0004](./0004-precompute-gesture-outcomes-once-per-gesture-on-the-server.md)
