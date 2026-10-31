---
id: T14
title: "Model Project with type, name comparison and open/closed on a date"
layer: "domain"
deps: ["T01"]
acs: ["AC-24", "AC-25", "AC-11"]
files_hint: ["modules/projects/src/domain/"]
owner: "TBD (backend lead)"
estimate: "S"
status: "todo"
---

# T14 — Model Project with type, name comparison and open/closed on a date

> Layer `domain` · estimate S · blocked by [T01](./t01-permissions-on-actor.md) · ACs: AC-24, AC-25, AC-11

## Why

Project rules of [PRD §5](../PRD.md) AC-24, AC-25, AC-11; [sad §5](../sad.md) projects/domain.

## What

- `Project` (type enum, close date); `isOpenOn(date)` — open through the end of the close date.
- Close-date rule: not before today, never cleared. Name key = `lower(trim(name))`. Tagged errors.

Files: `modules/projects/src/domain/`

## Definition of Done

- [ ] Unit tests: open on the close date, closed the day after; close date before today rejected; «Atlas» vs «atlas » same key.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
