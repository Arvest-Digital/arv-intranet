---
id: T40
title: "Build the free-list and my-schedule screens"
layer: "ui"
deps: ["T28"]
acs: ["AC-04", "AC-05", "AC-17", "AC-18"]
files_hint: ["apps/web/app/features/scheduling/routes/free-list*", "apps/web/app/features/scheduling/routes/my-schedule*", "apps/web/app/features/scheduling/components/free-list-*"]
owner: "TBD (frontend lead)"
estimate: "M"
status: "todo"
---

# T40 — Build the free-list and my-schedule screens

> Layer `ui` · estimate M · blocked by [T28](./t28-scheduling-http-reads.md) · ACs: AC-04, AC-05, AC-17, AC-18

## Why

US-02 and US-06 over the scheduling contract (flows 4 and 8, [sad §6](../sad.md)).

## What

- Free list form (weeks, min hours) in the URL; results most free first with free hours per week; validation message of AC-05.
- My schedule read-only week by week; AC-18 «not set up as a resource» state.
- Compose `app/shared/ui` primitives (table, dialog, select, dropdown-menu, input, button) and theme tokens; no new design system ([ADR-0002](../adr/0002-render-board-ssr-with-week-window-in-url.md)). Add a shadcn component via `pnpm ui:add` only if none fits.

Files: `apps/web/app/features/scheduling/routes/free-list*`, `apps/web/app/features/scheduling/routes/my-schedule*`, `apps/web/app/features/scheduling/components/free-list-*`

## Definition of Done

- [ ] Route/component tests: AC-05 message on bad input, ordering of results (AC-04), own leave type shown (AC-17), AC-18 state.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
