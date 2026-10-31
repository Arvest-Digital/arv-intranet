---
id: T25
title: "Implement the board and free-list queries"
layer: "app"
deps: ["T10", "T16", "T20", "T21", "T22"]
acs: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06", "AC-12b", "AC-21", "AC-22", "AC-29"]
files_hint: ["modules/scheduling/src/application/board.ts", "modules/scheduling/src/application/free-list.ts", "modules/scheduling/src/application/ports.ts"]
owner: "TBD (backend lead)"
estimate: "L"
status: "todo"
---

# T25 — Implement the board and free-list queries

> Layer `app` · estimate L · blocked by [T10](./t10-org-employee-records-app.md), [T16](./t16-projects-app.md), [T20](./t20-scheduling-weekly-figures.md), [T21](./t21-scheduling-visibility-policy.md), [T22](./t22-scheduling-infra.md) · ACs: AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-12b, AC-21, AC-22, AC-29

## Why

Critical flow 3 and flow 4 of [sad §6](../sad.md); bounded window ([ADR-0002](../adr/0002-render-board-ssr-with-week-window-in-url.md)); compute on read ([ADR-0005](../adr/0005-compute-capacity-and-availability-on-read.md)).

## What

- Board: validate window (≤ 12 visible weeks, ≤ 12 months back, ≤ 52 weeks forward), team / project filters, resources whose employment overlaps, figures per cell, visibility policy applied before returning.
- Free list: weeks 1–12 and hours ≥ 0 validated (AC-05), ranking from T20, redacted per viewer.

Files: `modules/scheduling/src/application/board.ts`, `modules/scheduling/src/application/free-list.ts`, `modules/scheduling/src/application/ports.ts`

## Definition of Done

- [ ] Use-case tests with fakes: AC-01 rows/columns and default window, AC-02 filters, AC-03 refusal, AC-04 ordering, AC-05 validation message, AC-06 incomplete excluded with note, AC-22 hidden end-date effects, AC-29 «away».
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
