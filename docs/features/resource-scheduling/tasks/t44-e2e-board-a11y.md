---
id: T44
title: "Add the board end-to-end test with the accessibility audit"
layer: "tests"
deps: ["T30", "T39", "T41"]
acs: ["AC-01", "AC-07", "AC-10"]
files_hint: ["e2e/tests/scheduling-board.spec.ts", "e2e/package.json", "e2e/db.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T44 — Add the board end-to-end test with the accessibility audit

> Layer `tests` · estimate M · blocked by [T30](./t30-wire-composition-ports.md), [T39](./t39-web-board.md), [T41](./t41-web-allocation-dialog.md) · ACs: AC-01, AC-07, AC-10

## Why

[sad §10](../sad.md) QS-7 automated accessibility audit; end-to-end plan-an-allocation path (critical flow 1).

## What

- Seed resources/projects; open the board; plan an allocation that overbooks; confirm; assert the cell shows «overbooked» as text.
- Add `@axe-core/playwright` (approved in sad §8) at a version past pnpm's minimum-release-age; audit the board.

Files: `e2e/tests/scheduling-board.spec.ts`, `e2e/package.json`, `e2e/db.ts`

## Definition of Done

- [ ] `pnpm test:e2e` green with zero axe violations on the board.
- [ ] Every board cell has a text state label (assertion).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
