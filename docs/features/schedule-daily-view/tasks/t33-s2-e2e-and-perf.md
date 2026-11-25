---
id: T33
title: "Add stage 2 e2e: drag and keyboard specs, a keyboard-only axe run, and the 300 ms preview performance test"
layer: "tests"
deps: ["T32"]
acs: ["AC-13", "AC-15", "AC-17", "AC-20"]
files_hint: ["e2e/tests/scheduling/gestures.spec.ts", "e2e/tests/scheduling/gestures-perf.spec.ts"]
owner: "TBD lead"
estimate: "M"
stage: "S2"
status: "todo"
---

# T33 — Add stage 2 e2e: drag and keyboard specs, a keyboard-only axe run, and the 300 ms preview performance test

> Stage 2 — gestures (gated by the recount) · layer `tests` · estimate M · blocked by T32 · ACs AC-13, AC-15, AC-17, AC-20

## Why

[QG-3 gesture feedback, QS-7](../sad.md#10-quality-requirements); [§11 flaky perf risk](../sad.md#11-risks-and-technical-debt).

## What

Playwright specs; seed 100 × 4 board; outcome table preloaded; retry once; failures investigated, not muted.

Files: `e2e/tests/scheduling/gestures.spec.ts`, `e2e/tests/scheduling/gestures-perf.spec.ts`

## Definition of Done

- [ ] pnpm test:e2e passes gestures.spec.ts (AC-13 move, AC-15 confirm/cancel, AC-17 two sessions, AC-20 keyboard-only with no axe violations) and gestures-perf.spec.ts asserts the preview updates within 300 ms of each arrow-key step on a seeded 100-resource × 4-week board.
- [ ] Specs green locally and in CI
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean
