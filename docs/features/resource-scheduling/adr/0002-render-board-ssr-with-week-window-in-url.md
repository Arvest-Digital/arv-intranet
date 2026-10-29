---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead"]
updated_at: "2026-10-29"
feature_size: M
stage: "04-05"
ticket: "TBD"
---

<!-- Format: MADR. Spawned by sdlc:architecture-design (§4 UI-architecture decision for web-frontend, blast-radius 2/3: irreversible + legitimate alternative). -->

# 0002 — Render the board server-side with the week window in the URL

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

The board shows one row per resource and one column per week: by default the current week and the 11 following, scrollable back up to 12 months (view only) and forward up to 52 weeks (AC-01). The web app is React Router 7 with SSR, and the browser can never call the api directly — only the web Worker's loaders and actions can (§2). We must decide how the board loads and moves through weeks, because it shapes the api's board query and how the 1500 ms target is met.

## Decision drivers

- PRD §6: board p95 ≤ 1500 ms for 100 resources × 12 weeks; holds at 52 weeks ahead.
- QG-3 (SAD §1) — bounded, predictable cost per request.
- Repo convention: thin loaders/actions calling a typed per-feature gateway (`.claude/rules/frontend/web.md`); existing `shared/ui` primitives.
- No new packages without approval (CLAUDE.md) — a client-side virtualised grid would likely need one.

## Considered options

1. **SSR with the week window in the URL** — `?from=&weeks=&team=&project=` drive one loader call per window; moving through time is a navigation; edits are route actions; JS only for dialogs and confirmations.
2. **SSR first window + client-side loading of further weeks** — fetchers load neighbouring weeks while scrolling and append them to a virtualised grid held in client state.

## Decision outcome

**Chosen:** Option 1. One request equals one bounded window, which keeps the api query and its cost predictable against the 1500 ms target, every view is a shareable link, forms work without client state, and nothing new needs to be installed. Smooth infinite scrolling is not a PRD requirement.

## Consequences

**Positive**
- The api exposes one board query parameterised by window and filters; caching and invalidation are trivial (none needed — the next navigation reloads).
- Loaders and actions stay thin; tests use the existing `fakeApi`.

**Negative**
- Scrolling through time moves in steps (window by window), not continuously.
- After a save, the action's revalidation reloads the whole visible window (≤ 12 weeks) rather than one cell.

**Neutral**
- A client-side grid can be added later on top of the same windowed query without changing the api contract.

## Links

- PRD: [[../PRD.md]] AC-01, AC-02, §6
- SAD: [[../sad.md]] §4
- Related ADR: [[0001-build-backend-service-and-web-frontend-surfaces]], [[0005-compute-capacity-and-availability-on-read]]
