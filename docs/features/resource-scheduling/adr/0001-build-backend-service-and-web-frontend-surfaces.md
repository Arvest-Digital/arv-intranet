---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-29"
feature_size: M
stage: "04-05"
ticket: "TBD"
---

<!-- Format: MADR. Spawned by sdlc:architecture-design (§4 Target-surface decision, blast-radius 2/3: irreversible + multi-module). -->

# 0001 — Build resource scheduling as a backend service plus a web frontend

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

PRD §4 puts every user in the browser — the board, the free list, allocation and leave dialogs, record maintenance, the spreadsheet upload — while the data and every rule live behind the private `arv-api` Worker. The PRD also needs one background task: deleting allocation history older than 12 months every month (PRD §6). We must decide which deployable surfaces the feature introduces, because that fixes the §5 containers and what every later stage generates (contract form, task layers, test tiers).

## Decision drivers

- PRD §4 user stories are all browser interactions; PRD §6.1 needs a server-side authorization boundary.
- The api Worker is private by design (§2) — only the web Worker can call it.
- The history-retention job runs monthly and consumes no events (PRD §6).
- Each extra surface adds its own contracts, task layer and test tiers (feature size M).

## Considered options

1. **`[backend-service, web-frontend]`** — the api Worker gains the business modules and owns the HTTP contract; the web Worker gains feature folders that consume it; the retention job is a Cron Trigger on the existing api Worker.
2. **`[backend-service, web-frontend, worker]`** — the same, plus the retention job declared as its own `worker` surface with an events contract and async flows.

## Decision outcome

**Chosen:** Option 1. Both surfaces are required by the PRD; a monthly `DELETE` behind a Cron Trigger on the api Worker shares its composition root and needs no event contract, so a separate `worker` surface would add ceremony without behaviour.

## Consequences

**Positive**
- `api-forge` generates one OpenAPI contract for the api; `break-tasks` adds a `ui` layer; `plan-tests` adds component, visual-regression and e2e-through-UI tiers.
- No new deployable: both Workers already exist and keep their bindings.

**Negative**
- The api Worker gains its first `scheduled` entry point (ARCHITECTURE.md planned it for the outbox relay); its wiring must go through the same composition root as `fetch`.

**Neutral**
- If an asynchronous use case appears later (outbox relay, queue consumers), the `scheduled`/`queue` handlers can be promoted to a `worker` surface then.

## Links

- PRD: [[../PRD.md]] §4, §6
- SAD: [[../sad.md]] §4
- Related ADR: [[0002-render-board-ssr-with-week-window-in-url]], [[0006-implement-unit-of-work-without-outbox]]
