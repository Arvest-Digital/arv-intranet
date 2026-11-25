---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead"]
updated_at: "2026-11-22"
feature_size: L
stage: "04-05"
ticket: "BRIEFS B-01 (docs/features/resource-scheduling/BRIEFS.md)"
---

# 0002 — Store the daily time interval as minutes from midnight on allocation segments and drop the rate

- **Status:** Accepted
- **Date:** 2026-11-22
- **Deciders:** dmitro.b (author / PM) with the architect during the architecture-design pass

## Context

Today an allocation segment ([resource-scheduling ADR-0008](../../resource-scheduling/adr/0008-model-allocation-as-effective-dated-segments.md)) stores `starts_on`, `ends_on`, `rate_minutes` and `rate_period` (`day` | `week` | `full-day`, the last for leave). Stage 3 changes this (BRIEF B-01, AC-23):
- every allocation except leave gets a required daily time interval in 15-minute steps, at most 24 hours, ending by 24:00;
- the weekly rate is removed, and the hours per day are the interval's length;
- a change of interval on a started allocation applies from today.

Each employee record gains a working-day start, 09:00 by default. Working hours end at start + daily capacity, which may fall off a 15-minute step for part-timers (AC-27, AC-27b). The data lives in two module schemas: `scheduling` and `org`.

## Decision drivers

- QG-1 / PRD §6 calculation correctness: exact figures and exact overlap verdicts.
- [resource-scheduling ADR-0009](../../resource-scheduling/adr/0009-store-minutes-and-compute-in-1-420-minute-ticks.md): integer minutes stored, integer ticks computed, no new packages.
- AC-23, AC-24, AC-27, AC-27b; one company time zone (BRIEF B-01 #10); no part-day leave.
- One source of truth for hours per day, so the interval and a rate can never disagree.

## Considered options

1. **Integer minutes from midnight, no stored rate.**
   - `allocation_segments` gets `starts_at_minute` and `ends_at_minute`: integers 0–1440, multiples of 15, start < end, NULL only for leave.
   - `rate_minutes` and `rate_period` `day`/`week` go; leave keeps a `full-day` kind.
   - `org.employee_records` gets `working_day_start_minute`, an integer multiple of 15, default 540. The working-day end is computed, never stored.
2. **Postgres `time` columns, no stored rate** — the same shape, with `starts_at`/`ends_at` of type `time`.
3. **Integer minutes plus a stored `rate_minutes`** — the interval is added and hours per day are also stored, for fast sums.

## Decision outcome

**Chosen:** Option 1. The interval works directly with the existing minute and tick arithmetic. An overlap is a comparison of integers, 24:00 is simply 1440, and the length of the interval is the only definition of hours per day. Option 2 forces string↔minute conversion at every boundary, and `24:00` is handled unevenly by drivers and JS parsing. Option 3 creates two sources of truth that can drift, a QG-1 risk, for a saving of one subtraction.

## Consequences

**Positive**
- A change of interval «from today» is a new effective-dated segment, exactly like a rate change today (AC-23 reuses ADR-0008).
- Overlap detection and «made worse» are pure integer functions in `scheduling/domain`, covered by rule-table tests.
- `org` exposes the working-day start through its facade's employment terms, so `scheduling` never reads `org` tables.

**Negative**
- The allocation form, the import format, the contracts and the board's «hours per week» wording all change (PRD §1 stage 3 amendments). The weekly rate disappears for planners.
- Raw SQL shows `540`, not `09:00`.

**Neutral**
- A part-timer's working-day end can fall off a 15-minute step (AC-27b). It is computed and shown exactly, never stored.

## Links

- PRD: [../PRD.md](../PRD.md) §5 AC-21–AC-27b; [../BRIEF.md](../BRIEF.md) B-01
- SAD: [../sad.md](../sad.md) §4
- Related ADR: [0003](./0003-replace-the-rate-without-converting-pre-production-allocations.md), [resource-scheduling ADR-0008](../../resource-scheduling/adr/0008-model-allocation-as-effective-dated-segments.md), [resource-scheduling ADR-0009](../../resource-scheduling/adr/0009-store-minutes-and-compute-in-1-420-minute-ticks.md)
