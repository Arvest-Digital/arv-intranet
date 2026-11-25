---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead"]
updated_at: "2026-11-22"
feature_size: L
stage: "04-05"
ticket: "BRIEFS B-01 (docs/features/resource-scheduling/BRIEFS.md)"
---

# 0004 — Precompute a gesture's outcomes once per gesture on the server

- **Status:** Accepted
- **Date:** 2026-11-22
- **Deciders:** dmitro.b (author / PM) with the architect during the architecture-design pass

## Context

Stage 2 lets a user with edit-allocations move an allocation, or drag its start or end edge, by whole working days, with a pointer or the keyboard (US-05–US-07). On every one-day step the user must see, within 300 ms:
- the new dates;
- each affected week's total against capacity;
- the days and weeks the change makes overbooked or worse;
- the time overlaps it creates or lengthens (stage 3 ships first, SAD §2).

The step must also show when the change would be refused: past plans, employment period, closed project. The rules live in `scheduling`'s domain. The web may not import module packages, and the browser reaches the api only through the web Worker.

## Decision drivers

- PRD §6: preview within 300 ms of each one-day step on a 100-resource × 4-week board; save p95 ≤ 500 ms.
- QG-1: one rule set. Previews must match the warning shown on save (AC-15, AC-20).
- AC-13, AC-14, AC-16, AC-17, AC-18: refusals, concurrency and permissions are checked at drop.
- Repo boundaries: web imports only contracts and `import type` from the api.

## Considered options

1. **An outcome table per gesture.** When a gesture starts, the web asks `scheduling` once for every reachable position within the visible window. For each position the server returns the resulting dates, weekly totals, the days and weeks made worse, the overlaps, or the refusal reason. Each step is a local lookup. The drop is an ordinary save with `version` and `confirm`, recomputed on fresh data.
2. **A server dry run on every step** — each step sends «what if I let go here?» through the web Worker to the api and waits for the answer.

## Decision outcome

**Chosen:** Option 1. The rules stay on the server in one place, and each step costs a lookup instead of two network hops and a database read. That leaves the 300 ms budget for rendering. The window is at most 4 weeks, so the table is small: a few dozen positions per gesture kind for one resource. Option 2 puts a network round trip inside every step and many requests on a fast drag.

## Consequences

**Positive**
- The preview and the save warning come from the same domain functions, so they cannot disagree on the data they were computed from.
- Keyboard and pointer gestures share one table and one code path (AC-20).

**Negative**
- The first step waits for one request (fired at gesture start). A slow response shows a brief «calculating» state.
- The table can go stale if someone else saves meanwhile. The drop's `version` check catches this and refuses with the current values (AC-17); open views do not update live.
- A new read on the scheduling contract (the outcome table) for api-forge to define.

**Neutral**
- The choice of drag-and-drop support (PRD §8) is independent: it only produces positions and steps, and is decided before stage 2 starts (SAD §11).

## Links

- PRD: [../PRD.md](../PRD.md) §5 AC-13–AC-20; §6
- SAD: [../sad.md](../sad.md) §4, §6
- Related ADR: [0001](./0001-render-day-view-and-timeline-as-ssr-zooms-of-the-board-url.md), [resource-scheduling ADR-0010](../../resource-scheduling/adr/0010-confirm-by-resubmitting-with-typed-confirmation-errors.md)
