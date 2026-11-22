---
id: T30
title: "Serve GET /scheduling/allocations/{id}/gesture-outcomes and harden the gesture drop on PATCH (version, confirm, permission at drop)"
layer: "ports"
deps: ["T29", "T19"]
acs: ["AC-13", "AC-14", "AC-16", "AC-17", "AC-18"]
files_hint: ["modules/scheduling/src/application/gesture-outcomes.ts", "modules/scheduling/src/application/gesture-outcomes.test.ts", "modules/scheduling/src/http/routes.ts", "modules/scheduling/src/http/presenter.ts", "packages/contracts/src/scheduling/reads.ts", "apps/api/test/integration/scheduling/gestures.test.ts", "apps/api/test/integration/redaction/matrix.test.ts"]
owner: "TBD lead"
estimate: "M"
stage: "S2"
status: "todo"
---

# T30 — Serve GET /scheduling/allocations/{id}/gesture-outcomes and harden the gesture drop on PATCH (version, confirm, permission at drop)

> Stage 2 — gestures (gated by the recount) · layer `ports` · estimate M · blocked by T29, T19 · ACs AC-13, AC-14, AC-16, AC-17, AC-18

## Why

[ADR-0004](../adr/0004-precompute-gesture-outcomes-once-per-gesture-on-the-server.md); [critical flow 3](../sad.md#6-runtime-view); [QS-5](../sad.md#10-quality-requirements); `getGestureOutcomes`, `updateAllocation` in [openapi.yaml](../contracts/openapi.yaml); [api-sync D-1](../contracts/api-sync-report.md#section-d--deferrals).

## What

Read use case with edit-allocations check and redaction; contract `GestureOutcomes`. The drop reuses `change-allocation` with `startsOn`/`endsOn`, `version` and `confirm`, recomputed on fresh data, permission checked at that moment.

Files: `modules/scheduling/src/application/gesture-outcomes.ts`, `modules/scheduling/src/application/gesture-outcomes.test.ts`, `modules/scheduling/src/http/routes.ts`, `modules/scheduling/src/http/presenter.ts`, `packages/contracts/src/scheduling/reads.ts`, `apps/api/test/integration/scheduling/gestures.test.ts`, `apps/api/test/integration/redaction/matrix.test.ts`

## Definition of Done

- [ ] Integration tests return the outcome table for an editor and 403/404 otherwise (D-1), a drop saved with the history entry (AC-13), past/employment/closed-project drops refused (AC-14, AC-16), two drops with the same version giving one success and one Conflict with current values (AC-17, QS-5), and a drop after the role lost edit-allocations refused (AC-18).
- [ ] Unit + integration tests pass
- [ ] Redaction matrix extended with the outcome read
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

Shares `presenter.ts`/`routes.ts` lane with T19/T20.
