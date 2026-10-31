---
id: T08
title: "Model EmployeeRecord, Team and PublicHoliday with their validation rules"
layer: "domain"
deps: ["T01"]
acs: ["AC-06", "AC-19", "AC-19d", "AC-20"]
files_hint: ["modules/org/src/domain/"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T08 — Model EmployeeRecord, Team and PublicHoliday with their validation rules

> Layer `domain` · estimate M · blocked by [T01](./t01-permissions-on-actor.md) · ACs: AC-06, AC-19, AC-19d, AC-20

## Why

Employee terms drive every capacity figure ([PRD §5](../PRD.md) AC-19, AC-20, AC-06; [sad §5](../sad.md) org/domain; [ADR-0009](../adr/0009-store-minutes-and-compute-in-1-420-minute-ticks.md) minutes).

## What

- `EmployeeRecord` (contract minutes, working-day set, employment period, team, login link, version) with `isIncomplete`.
- Validation: contract hours > 0 and ≤ 60/week, ≥ 1 working day, end ≥ start; Mon–Fri default; tagged errors per rule.
- `Team` (name + lead), `PublicHoliday`; shared name normalisation (`lower(trim)`) for AC-19d/AC-24-style comparison.
- `domain/errors.ts` with the org error codes of the OpenAPI `ApiError.code` list.

Files: `modules/org/src/domain/`

## Definition of Done

- [ ] Table-driven unit tests cover every AC-20 rule (0, negative, 61 h, no working day, end before start) and the AC-06 incompleteness rule.
- [ ] Unit test: «Platform» and «platform » normalise equal.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
