---
id: T11
title: "Implement team and public-holiday use cases"
layer: "app"
deps: ["T10"]
acs: ["AC-19d", "AC-27", "AC-28", "AC-19c"]
files_hint: ["modules/org/src/application/teams.ts", "modules/org/src/application/holidays.ts", "modules/org/src/application/ports.ts", "modules/org/src/application/org-api.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T11 — Implement team and public-holiday use cases

> Layer `app` · estimate M · blocked by [T10](./t10-org-employee-records-app.md) · ACs: AC-19d, AC-27, AC-28, AC-19c

## Why

Flows 10 and 12 of [sad §6](../sad.md); adding a holiday previews overbooking through `CapacityImpactCheck` ([ADR-0007](../adr/0007-invert-capacity-and-close-checks-through-host-wired-ports.md)).

## What

- Teams: create / rename / remove (refused with member count), duplicate name refused, lead must be a resource; permission `org:manage-employee-records`.
- Holidays: add (with impact check + confirm) / remove; permission `org:manage-holiday-list`; duplicate date → `Conflict`.

Files: `modules/org/src/application/teams.ts`, `modules/org/src/application/holidays.ts`, `modules/org/src/application/ports.ts`, `modules/org/src/application/org-api.ts`

## Definition of Done

- [ ] Use-case tests: AC-19d (create, rename, «platform » refused, remove-with-members refused naming the count), AC-28 (`Forbidden`).
- [ ] Use-case test: adding a holiday with a fake impact check returning weeks yields `ConfirmationRequired`, then saves on confirm (AC-27/AC-19c).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
