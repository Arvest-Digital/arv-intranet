---
id: T21
title: "Accept a start and end time per import row and refuse rows with a weekly rate"
layer: "app"
deps: ["T16"]
acs: ["AC-23"]
files_hint: ["modules/scheduling/src/domain/import-rows.ts", "modules/scheduling/src/domain/import-rows.test.ts", "modules/scheduling/src/application/import-preview.ts", "modules/scheduling/src/application/import-commit.ts", "packages/contracts/src/scheduling/imports.ts", "apps/api/test/integration/scheduling/import.test.ts", "apps/web/app/features/scheduling/components/import-page.tsx"]
owner: "TBD lead"
estimate: "M"
stage: "S3"
status: "todo"
---

# T21 — Accept a start and end time per import row and refuse rows with a weekly rate

> Stage 3 — time of day · layer `app` · estimate M · blocked by T16 · ACs AC-23

## Why

[PRD §8](../PRD.md#8-open-questions) import question (default: start and end per row, rate rows refused); [SAD §5 import](../sad.md#5-building-block-view); [api-sync D-3](../contracts/api-sync-report.md#section-d--deferrals); [data-model test fixtures](../data-model.md#test-fixtures).

## What

CSV row parsing, preview, commit and the import contract follow the PRD §8 default. The web import page shows the new columns in its help.

Files: `modules/scheduling/src/domain/import-rows.ts`, `modules/scheduling/src/domain/import-rows.test.ts`, `modules/scheduling/src/application/import-preview.ts`, `modules/scheduling/src/application/import-commit.ts`, `packages/contracts/src/scheduling/imports.ts`, `apps/api/test/integration/scheduling/import.test.ts`, `apps/web/app/features/scheduling/components/import-page.tsx`

## Definition of Done

- [ ] Import preview and commit tests accept rows with start/end times in 15-minute steps, refuse rate rows and invalid intervals with an explanation, and the import integration test selects starts_at_minute/ends_at_minute instead of the rate columns.
- [ ] Domain + application tests pass
- [ ] Import integration test passes against arv_test
- [ ] openapi `POST /scheduling/import` added via `/sdlc:api-forge schedule-daily-view --reconcile`
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

**Blocked by PRD §8** (owner PM + Tech Lead, due before stage 3). Confirm the default before starting; if it changes, re-scope this task.
