---
id: T13
title: "Expose team and public-holiday endpoints"
layer: "ports"
deps: ["T11", "T12"]
acs: ["AC-19d", "AC-27", "AC-28"]
files_hint: ["packages/contracts/src/org/", "modules/org/src/http/routes.ts", "modules/org/src/http/presenter.ts", "apps/api/test/integration/org/"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T13 — Expose team and public-holiday endpoints

> Layer `ports` · estimate M · blocked by [T11](./t11-org-teams-holidays-app.md), [T12](./t12-org-http-employee-records.md) · ACs: AC-19d, AC-27, AC-28

## Why

`/org/teams*` and `/org/public-holidays*` operations of [openapi.yaml](../contracts/openapi.yaml); read permissions per [api-sync-report.md](../contracts/api-sync-report.md) D-5.

## What

- Routes `listTeams`, `createTeam`, `updateTeam`, `deleteTeam`, `listPublicHolidays`, `createPublicHoliday`, `deletePublicHoliday` + contract schemas.

Files: `packages/contracts/src/org/`, `modules/org/src/http/routes.ts`, `modules/org/src/http/presenter.ts`, `apps/api/test/integration/org/`

## Definition of Done

- [ ] Api integration tests: duplicate team name → 409, remove team with members → 409 with count, holiday without permission → 403, holiday add returns 409 `ConfirmationRequired` when the (stubbed) check reports impact.
- [ ] Bodies validate against the OpenAPI examples.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- —
