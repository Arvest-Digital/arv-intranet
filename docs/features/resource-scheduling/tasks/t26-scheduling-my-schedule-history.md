---
id: T26
title: "Implement the my-schedule and allocation-history queries"
layer: "app"
deps: ["T25"]
acs: ["AC-16", "AC-17", "AC-18", "AC-29", "AC-12b"]
files_hint: ["modules/scheduling/src/application/my-schedule.ts", "modules/scheduling/src/application/history.ts", "modules/scheduling/src/application/ports.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T26 — Implement the my-schedule and allocation-history queries

> Layer `app` · estimate M · blocked by [T25](./t25-scheduling-board-free-list.md) · ACs: AC-16, AC-17, AC-18, AC-29, AC-12b

## Why

Flows 7 and 8 of [sad §6](../sad.md).

## What

- My schedule: resolve employee by login via the org facade (AC-18 when unlinked); own leave type always visible.
- History: last 12 months in order with who/when/before/after, including «imported» and «trimmed»; leave type redacted per viewer.

Files: `modules/scheduling/src/application/my-schedule.ts`, `modules/scheduling/src/application/history.ts`, `modules/scheduling/src/application/ports.ts`

## Definition of Done

- [ ] Use-case tests: AC-17, AC-18 (not set up as a resource), AC-16 ordering with trim attributed to the closer, AC-29 history redaction, AC-12b (edit-allocations may read history).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
