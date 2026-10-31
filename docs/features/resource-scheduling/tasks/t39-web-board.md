---
id: T39
title: "Build the schedule board with the week window and filters in the URL"
layer: "ui"
deps: ["T28"]
acs: ["AC-01", "AC-02", "AC-03", "AC-06", "AC-21", "AC-22", "AC-29"]
files_hint: ["apps/web/app/features/scheduling/scheduling.server.ts", "apps/web/app/features/scheduling/routes/board*", "apps/web/app/features/scheduling/components/board-*", "apps/web/app/routes.ts"]
owner: "TBD (frontend lead)"
estimate: "L"
status: "todo"
---

# T39 — Build the schedule board with the week window and filters in the URL

> Layer `ui` · estimate L · blocked by [T28](./t28-scheduling-http-reads.md) · ACs: AC-01, AC-02, AC-03, AC-06, AC-21, AC-22, AC-29

## Why

SSR board, `from` / `weeks` / `team` / `project` as search params ([ADR-0002](../adr/0002-render-board-ssr-with-week-window-in-url.md); critical flow 3).

## What

- Loader calls `getBoard` with URL params; prev/next window navigation within limits; team / project filters (no leave projects for viewers without see-leave-reasons).
- Each cell: «allocated/capacity», a text state label + `lucide-react` icon (never colour alone, sad §8 Accessibility), «away · N days».
- Forbidden → link to own schedule (AC-03).
- Compose `app/shared/ui` primitives (table, dialog, select, dropdown-menu, input, button) and theme tokens; no new design system ([ADR-0002](../adr/0002-render-board-ssr-with-week-window-in-url.md)). Add a shadcn component via `pnpm ui:add` only if none fits.

Files: `apps/web/app/features/scheduling/scheduling.server.ts`, `apps/web/app/features/scheduling/routes/board*`, `apps/web/app/features/scheduling/components/board-*`, `apps/web/app/routes.ts`

## Definition of Done

- [ ] Route/component tests: every cell state renders its text label (QS-7), URL params drive the loader call, forbidden view offers own schedule (AC-03).
- [ ] Theme-token contrast ≥ 4.5:1 for the state labels (checked again by T44's axe audit).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
