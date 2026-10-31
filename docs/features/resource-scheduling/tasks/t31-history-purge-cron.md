---
id: T31
title: "Add the monthly allocation-history purge and its Cron Trigger"
layer: "wiring"
deps: ["T22", "T30"]
acs: ["AC-16"]
files_hint: ["modules/scheduling/src/application/purge-history.ts", "apps/api/src/index.ts", "apps/api/wrangler.jsonc", "apps/api/test/integration/scheduling/"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T31 — Add the monthly allocation-history purge and its Cron Trigger

> Layer `wiring` · estimate M · blocked by [T22](./t22-scheduling-infra.md), [T30](./t30-wire-composition-ports.md) · ACs: AC-16

## Why

12-month retention ([PRD §5](../PRD.md) §6; [sad §6](../sad.md) Cross-cutting purge; [sad §7](../sad.md) Cron `0 3 1 * *`).

## What

- `purgeHistory(cutOff)` use case, idempotent; logs entries deleted + oldest remaining age (no personal data).
- `scheduled` handler in `index.ts`; `triggers.crons = ["0 3 1 * *"]`.

Files: `modules/scheduling/src/application/purge-history.ts`, `apps/api/src/index.ts`, `apps/api/wrangler.jsonc`, `apps/api/test/integration/scheduling/`

## Definition of Done

- [ ] Integration test with a fixed clock: entries older than 12 months deleted, newer kept, rerun deletes nothing (QS-5).
- [ ] `pnpm build` succeeds with the cron trigger in `wrangler.jsonc`.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- Shares `apps/api/src/index.ts` with T04 — already ordered by deps.
