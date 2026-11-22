---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead"]
updated_at: "2026-11-22"
feature_size: L
stage: "04-05"
ticket: "BRIEFS B-01 (docs/features/resource-scheduling/BRIEFS.md)"
---

# 0001 — Render the day view and the timeline server-side as zooms of the board URL

- **Status:** Accepted
- **Date:** 2026-11-22
- **Deciders:** dmitro.b (author / PM) with the architect during the architecture-design pass

## Context

The weekly board is rendered by React Router 7 on the server. Its window, filters and grouping are URL search params, so one loader makes one api call for one bounded window ([resource-scheduling ADR-0002](../../resource-scheduling/adr/0002-render-board-ssr-with-week-window-in-url.md)). The day view must keep the first week and the filters when switching between weeks and days (AC-01). It must open from a shared link and refuse an out-of-range link (AC-03), and so must the one-day timeline (AC-21). The day view must open within 1500 ms and the timeline within 1000 ms at p95. Stage 2 later adds gestures whose preview must update within 300 ms per step. We must decide how the web delivers these views.

## Decision drivers

- PRD §6: day view p95 ≤ 1500 ms (100 resources × 4 weeks); timeline p95 ≤ 1000 ms (100 resources); gesture feedback within 300 ms per step.
- AC-01, AC-02, AC-03, AC-12, AC-21: the zoom keeps the window and filters, shared links work, and the window limits are 12 months back and 52 weeks ahead.
- SAD §2: no new packages without approval; the browser never calls the api directly.
- QG-1: weekly verdicts are not sums of rounded days, so the client must not recompute them.

## Considered options

1. **Server-rendered zooms of the board URL.**
   - The day view is the board route with `zoom=day&from=&weeks=1..4`, keeping `team`, `project` and `view`.
   - The timeline is its own route with `date=`, plus the same filters.
   - The own schedule gets the same `zoom`/`date` params.
   - Each view is one loader call to one bounded api read, and stage 2 gestures are a client island on the rendered page.
2. **Client-side zoom over one load.** The loader fetches per-day data for the whole window once, and the browser switches weeks↔days and sums weeks itself in React state.

## Decision outcome

**Chosen:** Option 1. Every view stays one request for one bounded window: at most 4 weeks for the day view and 1 day for the timeline, both smaller than the 12-week weekly board. Shared links and the AC-03 refusal come for free, and weekly and daily verdicts both come from the server's exact arithmetic. Option 2 would load 12 weeks of days to make zooming instant and move weekly verdicts into the browser, which QG-1 rules out.

## Consequences

**Positive**
- Reuses the board's loader, gateway, filters and `shared/ui` components. Zooming adds routes and params but no client state store.
- The api read stays bounded, so its cost is predictable against the latency targets.

**Negative**
- Switching between weeks and days is a navigation with a server round trip, not an instant toggle.
- Stage 2 still needs client code for gestures (island + [ADR-0004](./0004-precompute-gesture-outcomes-once-per-gesture-on-the-server.md)), and that code must stay out of the server-rendered path on phones.

**Neutral**
- Grouping the day view by project (AC-01b) regroups the same per-day response in the web loader, as the weekly board does.

## Links

- PRD: [../PRD.md](../PRD.md) §5 AC-01–AC-03, AC-12, AC-21; §6
- SAD: [../sad.md](../sad.md) §4
- Related ADR: [resource-scheduling ADR-0002](../../resource-scheduling/adr/0002-render-board-ssr-with-week-window-in-url.md), [0004](./0004-precompute-gesture-outcomes-once-per-gesture-on-the-server.md)
