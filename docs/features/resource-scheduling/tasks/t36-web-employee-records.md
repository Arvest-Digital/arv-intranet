---
id: T36
title: "Build the employee-record screens"
layer: "ui"
deps: ["T12"]
acs: ["AC-19a", "AC-19b", "AC-19", "AC-19c", "AC-20", "AC-21", "AC-22"]
files_hint: ["apps/web/app/features/org/org.server.ts", "apps/web/app/features/org/routes/employee-records*", "apps/web/app/features/org/components/employee-record-*", "apps/web/app/routes.ts"]
owner: "TBD (frontend lead)"
estimate: "L"
status: "todo"
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

- [ ] Route/component tests (existing web test setup): validation errors rendered per rule (AC-20), already-linked login message (AC-19b), confirm dialog resubmits with `confirm: true` (AC-19c).
- [ ] `pnpm --filter @arv/web typecheck` and lint clean.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
