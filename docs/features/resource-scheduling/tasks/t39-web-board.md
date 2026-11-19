---
id: T39
title: "Build the schedule board with the week window and filters in the URL"
layer: "ui"
deps: ["T28"]
acs: ["AC-01", "AC-02", "AC-02b", "AC-03", "AC-06", "AC-21", "AC-22", "AC-29"]
files_hint: ["apps/web/app/features/scheduling/scheduling.server.ts", "apps/web/app/features/scheduling/routes/board*", "apps/web/app/features/scheduling/components/board-*", "apps/web/app/routes.ts"]
owner: "TBD (frontend lead)"
estimate: "L"
status: "done"
---

# T39 — Build the schedule board with the week window and filters in the URL

> Layer `ui` · estimate L · blocked by [T28](./t28-scheduling-http-reads.md) · ACs: AC-01, AC-02, AC-02b, AC-03, AC-06, AC-21, AC-22, AC-29

## Why

SSR board, `from` / `weeks` / `team` / `project` / `view` as search params ([ADR-0002](../adr/0002-render-board-ssr-with-week-window-in-url.md); critical flow 3).

## What

- Loader calls `getBoard` with URL params; prev/next window navigation within limits; zoom presets «1 week · 4 weeks · 12 weeks» only set `weeks` (1 / 4 / 12) — the 1-week window renders a wide detail cell per resource (state, «allocated/capacity», hours per project from `minutesPerWeek`, «away · N days»); build the switch as a segmented control that can take a later «Days» option (PRD §8); team / project filters (no leave projects for viewers without see-leave-reasons).
- Each cell: «allocated/capacity», a text state label + `lucide-react` icon (never colour alone, sad §8 Accessibility), «away · N days».
- Forbidden → link to own schedule (AC-03).
- `view=people|project` switch (AC-02b): by-project regroups the same `getBoard` response in the loader — project groups with weekly totals (leave excluded), per-resource hours on the project beside their whole-week state; for redacted viewers (`project: null`, `away: true`) all leave goes into one «Away» group. Design: Claude Design canvas, page V2, «Board by project».
- Compose `app/shared/ui` primitives (table, dialog, select, dropdown-menu, input, button) and theme tokens; no new design system ([ADR-0002](../adr/0002-render-board-ssr-with-week-window-in-url.md)). Add a shadcn component via `pnpm ui:add` only if none fits.

Files: `apps/web/app/features/scheduling/scheduling.server.ts`, `apps/web/app/features/scheduling/routes/board*`, `apps/web/app/features/scheduling/components/board-*`, `apps/web/app/routes.ts`

## Definition of Done

- [x] Route/component tests: every cell state renders its text label (QS-7), URL params drive the loader call, forbidden view offers own schedule (AC-03), by-project grouping totals and the single «Away» group for redacted leave (AC-02b) (`features/scheduling/board.test.ts`, `features/scheduling/routes/board.test.ts`, `features/scheduling/components/board.test.tsx`).
- [x] Theme-token contrast ≥ 4.5:1 for the state labels (checked again by T44's axe audit): computed on 8-bit sRGB — muted text is ≥ 4.5:1 on the background (4.74), the current-week tint (4.58, 1.5 % foreground), the quiet group rows (4.54, half of `--muted`) and in dark (≥ 5.8); past weeks don't mute text over the overbooked tint (it would be 4.48).
- [x] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- Route `/schedule` (`features/scheduling/routes/board.tsx`); «Schedule» shows in the top nav for holders of `scheduling:view-whole-board` or `scheduling:edit-allocations`. Follows the V2 design's Board (default, row expanded, 4 weeks, 1 week, no access, empty, no results) and Board by project boards with `app/shared/ui` (table, dropdown-menu, button) and theme tokens; the app keeps its top nav instead of the design's sidebar.
- URL params `from` (snapped to Monday), `weeks` (1–12, default 12), `team`, `project` (ids), `view` (`people` | `project`); bad values fall back to the default, defaults stay out of the URL. Prev / next move a week at a time and are disabled at 12 months back / 52 weeks ahead (as the api counts); a refused window shows the api's message with a link back to this week.
- Cells: state icon (`lucide-react`, one shape per state) + «allocated/capacity» + «+Nh over» / «Capacity unknown» / «Past end date» + «Away · Nd»; the state label is in the cell's text (visually hidden in the multi-week grid as in the design, visible in the 1-week cell) and in its accessible name. «Fully booked» is partly-booked at capacity («40/40»); incomplete records read «Incomplete record» (AC-06).
- Filters are single-choice (the api takes one `teamId` and one `projectId`), not the design's multi-select checkboxes. Leave projects are offered only with `scheduling:see-leave-reasons` (AC-29).
- By project: work projects by type then name, leave groups after; redacted leave in one «Away» group. Leave cells show «Away · Nd» from the cell's `leaveDays` (hours when a person has two named leave types in one week, as days can't be split by type); group totals show hours, or days away for leave.
- Left for later tasks: the cell / allocation popover, «New allocation» and «Book leave» (T41, T24), «Who's free» (T40), the week-picker dialog and people search (not in the task), public-holiday marks in the week header (needs the holiday list).
