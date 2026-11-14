---
id: T40
title: "Build the free-list drawer and the my-schedule screen"
layer: "ui"
deps: ["T28", "T39"]
acs: ["AC-04", "AC-05", "AC-17", "AC-18"]
files_hint: ["apps/web/app/features/scheduling/routes/board*", "apps/web/app/features/scheduling/routes/my-schedule*", "apps/web/app/features/scheduling/components/free-list-*"]
owner: "TBD (frontend lead)"
estimate: "M"
status: "todo"
---

# T40 — Build the free-list drawer and the my-schedule screen

> Layer `ui` · estimate M · blocked by [T28](./t28-scheduling-http-reads.md), [T39](./t39-web-board.md) · ACs: AC-04, AC-05, AC-17, AC-18

## Why

US-02 and US-06 over the scheduling contract (flows 4 and 8, [sad §6](../sad.md)).

## What

- Free list as a **drawer on the board route** (not a page): opened from the board toolbar; `free`, `freeWeeks`, `minFreeHours` in the board URL; the board loader calls the free-list query only when `free` is set. Form (weeks, min hours); note «counts from today … · All teams» — the board's window and team/project filters do not apply; results most free first with free hours per week; «capacity unknown» list (AC-06); validation message of AC-05; «Allocate» opens the allocation dialog (T41) prefilled — hidden without edit-allocations. Full-screen sheet at phone width; focus trapped, Esc closes.
- No sheet primitive in `app/shared/ui` yet — add it with `pnpm ui:add sheet`.
- My schedule read-only week by week; AC-18 «not set up as a resource» state; at phone width (390 px) a vertical list of week cards, current week first (PRD §6 Device support). Design: Claude Design canvas, page V2, «My schedule · phone».
- Compose `app/shared/ui` primitives (table, dialog, select, dropdown-menu, input, button) and theme tokens; no new design system ([ADR-0002](../adr/0002-render-board-ssr-with-week-window-in-url.md)). Add a shadcn component via `pnpm ui:add` only if none fits.

Files: `apps/web/app/features/scheduling/routes/board*` (loader + drawer param), `apps/web/app/features/scheduling/routes/my-schedule*`, `apps/web/app/features/scheduling/components/free-list-*`

## Definition of Done

- [ ] Route/component tests: drawer opens from the URL params and the loader calls the free list only then, AC-05 message on bad input, ordering of results (AC-04), own leave type shown (AC-17), AC-18 state.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
