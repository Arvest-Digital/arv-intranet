---
id: T44
title: "Add the board end-to-end test with the accessibility audit"
layer: "tests"
deps: ["T30", "T39", "T41"]
acs: ["AC-01", "AC-07", "AC-10"]
files_hint: ["e2e/tests/scheduling-board.spec.ts", "e2e/package.json", "e2e/db.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "done"
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

- [x] `pnpm test:e2e` green with zero axe violations on the board.
- [x] Every board cell has a text state label (assertion).
- [x] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- The spec is `e2e/tests/scheduling/board.spec.ts`, following the per-module folders of `e2e/tests/identity/`. It seeds through `@arv/db/testing` and reuses `useSession`, `open` and `clickToOpen` from `tests/identity/session.ts`, so `e2e/db.ts` needed no change.
- Dates follow today (UTC, as the web counts them). Test Resource A has 32h/week on Alpha; adding 16h/week on Beta next week reaches 48h against 40h. The test checks the confirm view's week row, then «Save anyway», then a cell reading «Overbooked · 48/40 · +8h over».
- Every `[data-state]` cell is checked for its state's text label before and after the save.
- `@axe-core/playwright` 4.14.0 is pinned exactly, like Playwright, and was well past the minimum release age. The audit uses WCAG 2.0/2.1 A and AA plus 2.2 AA. It runs once with the light colour scheme and once with dark; the test asserts `<html>` has the `.dark` class in the dark pass, so it can't audit light twice.
- The audit found one violation, now fixed: the board's Team/Project filter buttons had `aria-label="Team: All"` over the visible text «Team All» (WCAG 2.5.3 Label in Name). They are now named by their visible text.

