---
id: T37
title: "Build the teams and public-holiday screens"
layer: "ui"
deps: ["T13"]
acs: ["AC-19d", "AC-27", "AC-28", "AC-19c"]
files_hint: ["apps/web/app/features/org/routes/teams*", "apps/web/app/features/org/routes/holidays*", "apps/web/app/features/org/components/team-*", "apps/web/app/features/org/components/holiday-*"]
owner: "TBD (frontend lead)"
estimate: "M"
status: "todo"
---

# T37 — Build the teams and public-holiday screens

> Layer `ui` · estimate M · blocked by [T13](./t13-org-http-teams-holidays.md) · ACs: AC-19d, AC-27, AC-28, AC-19c

## Why

US-07 (teams) and US-09 over the org contract.

## What

- Teams list/create/rename/remove with the refusal messages; holiday list add/remove with the impact confirm dialog.
- Compose `app/shared/ui` primitives (table, dialog, select, dropdown-menu, input, button) and theme tokens; no new design system ([ADR-0002](../adr/0002-render-board-ssr-with-week-window-in-url.md)). Add a shadcn component via `pnpm ui:add` only if none fits.

Files: `apps/web/app/features/org/routes/teams*`, `apps/web/app/features/org/routes/holidays*`, `apps/web/app/features/org/components/team-*`, `apps/web/app/features/org/components/holiday-*`

## Definition of Done

- [ ] Route/component tests: duplicate name and remove-with-members messages (AC-19d), holiday confirm dialog (AC-27), forbidden state (AC-28).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- `org.server.ts` / `routes.ts` are touched by T36 too — keep these routes in their own files to avoid a lane clash.
