---
id: T32
title: "Add the QG-2 redaction matrix and the concurrent-save test"
layer: "tests"
deps: ["T30"]
acs: ["AC-03", "AC-07b", "AC-12b", "AC-22", "AC-29"]
files_hint: ["apps/api/test/integration/redaction/", "apps/api/test/integration/scheduling/concurrency.test.ts"]
owner: "TBD (backend lead)"
estimate: "L"
status: "todo"
---

# T32 — Add the QG-2 redaction matrix and the concurrent-save test

> Layer `tests` · estimate L · blocked by [T30](./t30-wire-composition-ports.md) · ACs: AC-03, AC-07b, AC-12b, AC-22, AC-29

## Why

[sad §10](../sad.md) QG-2 (0 responses leak leave type / end date) and QS-4 (0 lost updates); redaction regressions are a High risk ([sad §11](../sad.md)).

## What

- Table-driven api tests: every read endpoint × permission combination × {own, other} resource, asserting on response bodies (leave type, leave project name, end date, allocations past end).
- Concurrent save: two PATCHes with the same `version` → one 200, one 409 with current values.

Files: `apps/api/test/integration/redaction/`, `apps/api/test/integration/scheduling/concurrency.test.ts`

## Definition of Done

- [ ] Matrix covers every read operation in openapi.yaml (test enumerates them and fails if one is missing).
- [ ] Concurrent-save test green; `pnpm test:integration` green.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- The Security Lead signs off on this matrix at the security review (PRD §6.1; sync report D-5).
