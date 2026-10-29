---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-29"
feature_size: M
stage: "04-05"
ticket: "TBD"
---

<!-- Format: MADR. Spawned by sdlc:architecture-design (§8 crosscutting decision, blast-radius 3/3). -->

# 0010 — Confirm by re-submitting the request, signalled by typed `ConfirmationRequired`, `Forbidden` and detailed `Conflict` errors

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

Six actions show their consequences and save only after the user confirms: allocation and leave saves that overbook (AC-10, AC-15), contract-hours or working-days changes (AC-19c), adding a holiday (AC-27), closing a project (AC-25) and the import (AC-30). Other responses must carry structured data too: a missing permission must be named (AC-12, AC-33) and a concurrent-edit conflict must show the current values and who changed them (AC-07b). Today `@arv/contracts/shared` has only `NotFound` and `Conflict`, and the error body is `{ error: { _tag, message } }` with no room for data.

## Decision drivers

- PRD AC-07b, AC-10, AC-12, AC-19c, AC-25, AC-27, AC-30, AC-33.
- ARCHITECTURE.md: only a new *kind* of HTTP failure adds a contract error; changes to contracts are additive.
- Server-side enforcement of «saves only after the user confirms» (ADR-0007) and recomputation on fresh data (ADR-0005).

## Considered options

1. **Typed errors and re-submit** — add `Forbidden` (403), `ConfirmationRequired` (409, with the impact list) and details on `Conflict`; error bodies gain an optional `details` field; confirming re-sends the same request with `confirm: true` and the server recomputes.
2. **200 with an outcome union** — confirmation is a successful response `{ outcome: "saved" | "confirmation_required", … }`; `Forbidden` and conflict details are still added.
3. **Separate preview plus signed token** — a preview call returns the impact and a signed token; the save accepts the token and refuses if the impact changed.

## Decision outcome

**Chosen:** Option 1. One mechanism serves all six actions, the server keeps no state between warning and confirmation (the import does not stage the spreadsheet), and a client can never mistake «not saved yet» for success. Option 2 makes every save endpoint return two kinds of success; option 3 doubles the endpoints and needs token signing and expiry.

## Consequences

**Positive**
- Shared, additive contract changes every later module can reuse; `toHttpError` maps the new kinds in one place.
- Confirmation always reflects current data: if another user changed the plan in between, the user sees the new impact instead of a stale one.

**Negative**
- Changes to two shared packages (`@arv/contracts/shared`, `@arv/platform/http`) and to `ApiErrorBody`; the web's `failure()` helper must surface `details`.
- The import file is uploaded and parsed twice (preview, then confirm) — within the 10 s preview target for 2,000 rows.

**Neutral**
- A user may see a second, different warning after confirming if the plan changed meanwhile; that is the intended behaviour.

## Links

- PRD: [[../PRD.md]] AC-07b, AC-10, AC-12, AC-15, AC-19c, AC-25, AC-27, AC-30, AC-33
- SAD: [[../sad.md]] §6, §8
- Related ADR: [[0007-invert-capacity-and-close-checks-through-host-wired-ports]], [[0008-model-allocation-as-effective-dated-segments]]
