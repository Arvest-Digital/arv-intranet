---
id: T25
title: "Build the access-list screens: list, add with pre-selected role, rename, remove and assign roles"
layer: "ui"
deps: ["T18", "T24"]
acs: ["AC-04", "AC-05", "AC-06", "AC-07", "AC-12", "AC-13", "AC-14", "AC-21"]
files_hint: ["apps/web/app/features/identity/routes/access-users.tsx", "apps/web/app/features/identity/routes/users.tsx", "apps/web/app/features/identity/components/user-list.tsx", "apps/web/app/features/identity/components/add-user-dialog.tsx", "apps/web/app/features/identity/components/user-roles-dialog.tsx", "apps/web/app/features/identity/identity.server.ts", "apps/web/app/routes.ts"]
owner: "TBD (frontend lead)"
estimate: "M"
status: "done"
---

# T25 — Build the access-list screens: list, add with pre-selected role, rename, remove and assign roles

> Layer `ui` · estimate M · blocked by T18, T24 · ACs: AC-04, AC-05, AC-06, AC-07, AC-12, AC-13, AC-14, AC-21 ([PRD §5](../PRD.md))

## Why

[sad §6](../sad.md) Flows 4, 5, 8 and Critical flow 3; PRD US-03 and US-05.

## What

- Replace the scaffold `users.tsx` with `access/users`: `Table` list, `Dialog` add form (email, name, roles with the pre-selected one ticked), rename, remove with confirm, assign roles showing the combined permissions in plain words (AC-12).
- Api errors (400 domain, 409 duplicate, 409 last admin) shown inline with the api's message.
- Reuse `Table`, `Dialog`, `Input`, `Button`, `Select` / `DropdownMenu`.

Files: `apps/web/app/features/identity/routes/access-users.tsx`, `apps/web/app/features/identity/routes/users.tsx`, `apps/web/app/features/identity/components/user-list.tsx`, `apps/web/app/features/identity/components/add-user-dialog.tsx`, `apps/web/app/features/identity/components/user-roles-dialog.tsx`, `apps/web/app/features/identity/identity.server.ts`, `apps/web/app/routes.ts`

## Definition of Done

- [x] Component and route tests: the pre-selected role is ticked by default and can be unticked (AC-13); the last-admin 409 shows «appoint another admin first» (AC-14); rename keeps roles (AC-21).
- [x] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- A role multi-select needs a checkbox. `pnpm ui:add checkbox` adds the shadcn primitive, but ask first if it pulls in a new package. Shares `identity.server.ts` and `routes.ts` with T26, so they run in one lane.
