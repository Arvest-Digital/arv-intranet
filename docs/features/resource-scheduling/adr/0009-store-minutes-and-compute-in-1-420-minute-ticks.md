---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead"]
updated_at: "2026-10-29"
feature_size: M
stage: "04-05"
ticket: "TBD"
---

<!-- Format: MADR. Spawned by sdlc:architecture-design (§8 crosscutting decision, blast-radius 3/3). -->

# 0009 — Store hours as integer minutes and compute in integer ticks of 1/420 minute

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

Contract hours are spread evenly over a resource's working days (one to seven days), allocations are prorated by working days and skip public holidays, and leave takes a full daily capacity (AC-08, AC-15, AC-19). Many of these shares are not finite decimals — 40 hours over 3 days is 13⅓ hours a day — and JavaScript floating-point numbers accumulate error, so a fully booked week could compare as overbooked. PRD §6 requires figures computed without intermediate rounding and overbooking judged on the exact figures. The storage unit is shared by `org` (contract hours) and `scheduling` (allocation hours).

## Decision drivers

- PRD §6 calculation correctness: 100% of weekly figures match the proration rules; no intermediate rounding; shown rounded to the nearest half hour.
- AC-09: allocation hours are multiples of a quarter hour.
- No new packages without approval (§2); pure domain functions (ADR-0005).

## Considered options

1. **Integer minutes stored, integer 1/420-minute ticks computed** — every input is a whole number of minutes; multiplying by 420 (the least common multiple of 1…7) makes every daily share an integer.
2. **Rational numbers** — a small numerator/denominator type with its own arithmetic.
3. **A decimal arithmetic library** — a new package for exact decimals.

## Decision outcome

**Chosen:** Option 1. Every quantity the rules produce is an exact integer, comparisons are plain integer comparisons, and no package is needed. Option 2 is exact but needs normalisation and overflow care in hand-written arithmetic; option 3 needs a new package and still rounds repeating fractions such as 13⅓.

## Consequences

**Positive**
- Overbooking, availability sums and the free-list ranking are exact (QG-1); rule-table tests compare integers.
- Integers stay far below `Number.MAX_SAFE_INTEGER` at PRD scale (a year of 24-hour days is ~2.2 × 10⁸ ticks).

**Negative**
- Every developer must know the unit; a branded `Minutes` / `Ticks` type in the domain prevents mixing them with plain numbers.
- Contract hours that are not whole minutes cannot be stored (no PRD case needs them).

**Neutral**
- Conversion to hours with half-hour rounding happens only in presenters, for display.

## Links

- PRD: [[../PRD.md]] §6, AC-08, AC-09, AC-15, AC-19, AC-20
- SAD: [[../sad.md]] §8
- Related ADR: [[0005-compute-capacity-and-availability-on-read]]
