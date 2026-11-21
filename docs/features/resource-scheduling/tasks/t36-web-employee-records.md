---
id: T36
title: "Build the employee-record screens"
layer: "ui"
deps: ["T12"]
acs: ["AC-19a", "AC-19b", "AC-19", "AC-19c", "AC-20", "AC-21", "AC-22"]
files_hint: ["apps/web/app/features/org/org.server.ts", "apps/web/app/features/org/routes/employee-records*", "apps/web/app/features/org/components/employee-record-*", "apps/web/app/routes.ts"]
owner: "TBD (frontend lead)"
estimate: "L"
status: "done"
---

# T36 — Build the employee-record screens

> Layer `ui` · estimate L · blocked by [T12](./t12-org-http-employee-records.md) · ACs: AC-19a, AC-19b, AC-19, AC-19c, AC-20, AC-21, AC-22

## Why

US-07 screens over the org contract; modelled on `features/identity` ([sad §5](../sad.md) web).

## What

- List, create, edit (with version), link login; rule errors shown per field; `ConfirmationRequired` → confirm dialog listing overbooked weeks, then resubmit with `confirm: true`; conflict shows current values.
- Compose `app/shared/ui` primitives (table, dialog, select, dropdown-menu, input, button) and theme tokens; no new design system ([ADR-0002](../adr/0002-render-board-ssr-with-week-window-in-url.md)). Add a shadcn component via `pnpm ui:add` only if none fits.

Files: `apps/web/app/features/org/org.server.ts`, `apps/web/app/features/org/routes/employee-records*`, `apps/web/app/features/org/components/employee-record-*`, `apps/web/app/routes.ts`

## Definition of Done

- [x] Route/component tests (existing web test setup): validation errors rendered per rule (AC-20), already-linked login message (AC-19b), confirm dialog resubmits with `confirm: true` (AC-19c) (`features/org/routes/employee-records.test.ts`, `features/org/components/employee-record-{dialog,list}.test.tsx`).
- [x] `pnpm --filter @arv/web typecheck` and lint clean.
- [x] `pnpm lint && pnpm typecheck && pnpm test` clean (Biome clean; `check:modules` trips only on the git-ignored `modules/.omc/` tool folder when it exists)

## Notes

- Route `/people` (`features/org/routes/employee-records.tsx`); «People» shows in the top nav for `org:manage-employee-records`. Matches the V2 design's People list, record form, login-linked, capacity-impact and end-date boards using `app/shared/ui`; the design's side navigation and the Teams tab are not part of this task (Teams → T37).
- The login picker reads identity's `/users` (the access list). Only holders of `identity:manage-access` may read it; without it the loader degrades: the list says «Linked»/«Not linked» and the form keeps the current link (no `userId` sent). A login search endpoint for record managers would remove this gap — not in the contract today.
- `refusalResponse` and the refusal constants moved to `app/shared/lib/refusal{,.server}.ts` so features other than identity can use them; identity re-exports them.
- AC-21: after a save with an end date the page says allocations past it are kept and marked as needing attention on the board; the count of those allocations is scheduling's and isn't shown (the org answer doesn't carry it).
- Version conflict: the dialog shows the values saved meanwhile and «Edit their version» reloads the form at the new version.
