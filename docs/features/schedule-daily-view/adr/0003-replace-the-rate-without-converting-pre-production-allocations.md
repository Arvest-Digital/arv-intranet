---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead"]
updated_at: "2026-11-22"
feature_size: L
stage: "04-05"
ticket: "BRIEFS B-01 (docs/features/resource-scheduling/BRIEFS.md)"
---

# 0003 — Replace the rate with the time interval without converting allocations, because none exist in production yet

- **Status:** Accepted
- **Date:** 2026-11-22
- **Deciders:** dmitro.b (author / PM) with the architect during the architecture-design pass

## Context

The PRD (AC-28, NFR «Migration correctness», PRD §8 rounding and notification questions) assumes that stage 3 converts existing weekly- and daily-rate allocations. Each would get an interval from the resource's working-day start, recorded in history as a system change. Converting needs working days from `org`, so it must not be a cross-schema SQL migration. It also needs domain rounding and a planner report. During the architecture pass the author stated that scheduling is **not in production yet** and that every allocation that exists is test data, which can be deleted during development.

## Decision drivers

- [ADR-0002](./0002-store-daily-time-interval-as-minutes-on-segments-and-drop-the-rate.md): the rate columns are replaced by a time interval.
- Repo ADR 0001: no queries across module schemas.
- SAD §2 build order: stage 1 → stage 3 → stage 2.
- Author, 2026-11-22: «Проєкт ще не на проді, наразі створені аллокації лише тестові, я можу видалити їх при розробці, і нам не доведеться їх мігрувати».

## Considered options

1. **No conversion.** Stage 3 reaches production before any real allocation exists. Its drizzle-generated migration replaces the rate columns with the interval columns (NOT NULL for non-leave), and test allocations are deleted before the migration runs.
2. **Expand → convert → contract.**
   - An additive migration adds the new columns.
   - An idempotent conversion use case in `scheduling` reads working days and the working-day start through `OrgApi`, writes `converted` history entries and has a dry-run report for planners.
   - A release script runs it before and after the new code deploys.
   - A contracting migration then drops the rate columns.

## Decision outcome

**Chosen:** Option 1. With no production data, the conversion would rewrite only test rows. All of its machinery would be built and then thrown away: the use case, the history kind, the release script, the dry-run report and the two-step migration. Option 2 is the fallback if real allocations reach production first.

## Consequences

**Positive**
- The feature's only irreversible data step disappears. There is no system change in history, no rounding policy for converted rates and no planner list of migration overlaps.
- One drizzle-generated migration for stage 3.

**Negative**
- **Precondition:** no real allocation may be entered in production before stage 3 is deployed there. In practice, scheduling's first production launch includes stage 3, and the «2 weeks after stage 1 ships» recount happens after that launch. If the precondition breaks, Option 2 must be built before stage 3 ships (§11 risk).
- Test and demo allocations in every environment, previews included, are lost at the stage 3 migration, unless they are re-seeded with intervals.

**Neutral**
- PRD AC-28, the NFR «Migration correctness» and the two PRD §8 questions about converted rates and migration overlaps no longer apply. They are recorded as a decision override in SAD §1, and SAD §10 QG-4 restates the goal as «no allocation without an interval after the stage 3 release».

## Links

- PRD: [../PRD.md](../PRD.md) §5 AC-28; §6 «Migration correctness»; §8
- SAD: [../sad.md](../sad.md) §4, §7, §11
- Related ADR: [0002](./0002-store-daily-time-interval-as-minutes-on-segments-and-drop-the-rate.md)
