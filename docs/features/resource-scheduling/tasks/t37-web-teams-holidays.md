---
id: T37
title: "Build the teams and public-holiday screens"
layer: "ui"
deps: ["T13"]
acs: ["AC-19d", "AC-27", "AC-28", "AC-19c"]
files_hint: ["apps/web/app/features/org/routes/teams*", "apps/web/app/features/org/routes/holidays*", "apps/web/app/features/org/components/team-*", "apps/web/app/features/org/components/holiday-*"]
owner: "TBD (frontend lead)"
estimate: "M"
status: "done"
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

- [x] Route/component tests: duplicate name and remove-with-members messages (AC-19d), holiday confirm dialog (AC-27), forbidden state (AC-28) (`features/org/routes/{teams,holidays}.test.ts`, `features/org/components/{team-list,holiday-add-dialog,holiday-list}.test.tsx`).
- [x] `pnpm lint && pnpm typecheck && pnpm test` clean (Biome clean; `check:modules` trips only on the git-ignored `modules/.omc/` tool folder when it exists)

## Notes

- `org.server.ts` / `routes.ts` are touched by T36 too — keep these routes in their own files to avoid a lane clash.
- Routes `/people/teams` (`features/org/routes/teams.tsx`, a «Teams» tab next to «Employees» under People) and `/holidays` (`features/org/routes/holidays.tsx`, in the top nav for everyone signed in). Matches the V2 design's Teams, Holidays list/add/impact and Forbidden boards using `app/shared/ui`.
- The contract requires a team lead to create a team, which the design's inline «New team» row doesn't show: the row has a team-lead select next to the name. The rename row also offers the lead, so teams imported without one can get one.
- Resource counts per team come from the employee-record list (same `org:manage-employee-records` permission as team writes).
- Holidays: anyone reads the list, with the year in the URL (`?year=`). Without `org:manage-holiday-list` the page is read-only; a refused add/remove (403) shows the forbidden screen naming the permission (AC-28).
- The «missing permission» refusal now carries the permission's name (`refusalResponse(failed, request, 'manage holiday list')`) and the root screen shows «You don't have the “…” permission. Ask an admin to grant it.»; without a name it keeps the old manage-access text. The People loader now names «manage employee records».
