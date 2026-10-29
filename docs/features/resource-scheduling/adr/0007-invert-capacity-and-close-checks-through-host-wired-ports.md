---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead"]
updated_at: "2026-10-29"
feature_size: M
stage: "04-05"
ticket: "TBD"
---

<!-- Format: MADR. Spawned by sdlc:architecture-design (§5 building-block decision, blast-radius 3/3). -->

# 0007 — Invert the capacity-impact and project-closing checks through host-wired ports

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

ADR-0003 split the feature into `org`, `projects` and `scheduling`, with `scheduling` depending on the other two. Three behaviours need scheduling data at the moment another module saves: changing a resource's contract hours or working days (AC-19c) and adding a public holiday (AC-27) must first list every resource-week that would become overbooked and save only after confirmation; closing a project (AC-25) must list the allocations that will be trimmed or removed, then trim them, record history attributed to the closer, and close the project — all atomically. A direct call from `org` or `projects` to `scheduling` would create a cycle, which the module graph forbids.

## Decision drivers

- Module graph must stay acyclic (`pnpm check:modules`, CLAUDE.md).
- AC-19c / AC-25 / AC-27: «saves only after the user confirms» and the close-and-trim must be atomic (ADR-0006).
- Each module owns its own operations and HTTP endpoints (ARCHITECTURE.md: organise by business capability).

## Considered options

1. **Ports owned by the called module, implemented by `scheduling`, wired by the host** — `org` defines `CapacityImpactCheck`, `projects` defines `ProjectClosingHook`, each exported from its facade; `scheduling` provides Layers implementing them; `apps/api/src/composition.ts` wires them.
2. **Endpoints in `scheduling`** — the three operations live in `scheduling`'s routes, which compute the preview and then call `org` / `projects` facade commands in one unit of work.
3. **Warnings orchestrated by the web** — the web calls a scheduling preview, shows it, then calls the `org` save; closing a project still needs a server-side mechanism.

## Decision outcome

**Chosen:** Option 1. Each operation stays in the module that owns it, the server enforces the warn-then-confirm rule and the atomic trim, and the package graph keeps only `scheduling → org` and `scheduling → projects`. Option 2 would leave `org` with a capacity-changing command that skips the warning; option 3 cannot enforce the rule server-side and needs a second mechanism for closing.

## Consequences

**Positive**
- `org` and `projects` call their own port inside their own unit of work; the confirmation flag and the preview come from the same server-side computation (ADR-0005).
- Any future caller of `org`'s or `projects`' facade gets the same check automatically.

**Negative**
- A new pattern for this repo: a module's facade exports a port that a *dependent* module implements. It must be documented in `ARCHITECTURE.md` (Cross-module communication) in the same PR as the code.
- `org` and `projects` need a default no-op Layer for their port so they compose and test without `scheduling`; forgetting to replace it in the host would silently skip the checks — covered by an api integration test per operation.

**Neutral**
- If `scheduling` ever moves to its own Worker, its port implementations become calls over a service binding; the ports' shapes do not change.

## Links

- PRD: [[../PRD.md]] AC-19c, AC-25, AC-27
- SAD: [[../sad.md]] §5, §6
- Related ADR: [[0003-split-into-org-projects-scheduling-modules]], [[0005-compute-capacity-and-availability-on-read]], [[0006-implement-unit-of-work-without-outbox]]
