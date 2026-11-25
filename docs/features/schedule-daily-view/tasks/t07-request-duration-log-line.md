---
id: T07
title: "Replace hono/logger with a one-line structured request log (route id, status, ms) in the api host"
layer: "wiring"
deps: []
acs: []
files_hint: ["apps/api/src/index.ts", "apps/api/src/middleware/request-log.ts", "apps/api/src/middleware/request-log.test.ts", "ARCHITECTURE.md"]
owner: "TBD lead"
estimate: "S"
stage: "S1"
status: "todo"
---

# T07 — Replace hono/logger with a one-line structured request log (route id, status, ms) in the api host

> Stage 1 — day view · layer `wiring` · estimate S · blocked by — · ACs — (NFR / enabling work)

## Why

Production metric for the PRD §6 latency NFRs and the §7 KPI ([SAD §7 Monitoring](../sad.md#7-deployment-view), [§8 Logging](../sad.md#8-crosscutting-concepts)). No AC; it serves NFRs only.

## What

Middleware `request-log.ts` logs `{ route, status, ms }` with `routePath` from Hono and replaces `logger()` in `apps/api/src/index.ts`. Defects are still logged by `runEffect`.

Files: `apps/api/src/index.ts`, `apps/api/src/middleware/request-log.ts`, `apps/api/src/middleware/request-log.test.ts`, `ARCHITECTURE.md`

## Definition of Done

- [ ] A unit test shows one JSON line per request with the Hono route pattern, status and duration, and no query string, name, date or leave type; hono/logger is gone and ARCHITECTURE.md describes the line.
- [ ] Unit test asserts the shape and the absence of personal data
- [ ] ARCHITECTURE.md updated in the same PR (structural: host middleware)
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Independent; can run first. Host-only code, no business logic.
