---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-10-29"
feature_size: M
stage: "04-05"
ticket: "TBD"
---

<!-- Format: MADR. Spawned by sdlc:architecture-design (§4 strategic decision, blast-radius 3/3). -->

# 0004 — Resolve the actor's permissions on every request and carry them on `Actor`

- **Status:** Accepted
- **Date:** 2026-10-29
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

Access is decided by six named permissions granted through access roles by a separate roles/permissions feature that is not built yet (PRD §3, §6.1). After ADR-0003 they belong to three modules, and the one-time import needs three of them at once (AC-33). Permissions must be checked at the moment of each action, not at sign-in (AC-14). Today `@arv/kernel`'s `Actor` is `Anonymous | User { id }` and authentication itself is still open (repo ADR 0001), so every request is anonymous.

## Decision drivers

- PRD §6.1: deny by default; checked at every action; edit-allocations includes view-whole-board; no other implication.
- QG-2 (SAD §1) — confidentiality; mandatory security review.
- AC-14 — a permission removed after the board was opened must fail the next save.
- Module graph stays small and acyclic; kernel changes need explicit approval (CLAUDE.md) — approved in this decision.

## Considered options

1. **Permissions on `Actor`, resolved per request** — the api host's authentication middleware asks the roles/permissions feature's facade for the user's permissions on every request and puts the set on `Actor.User`; use cases check it.
2. **Each module calls an access facade** — `org`, `projects` and `scheduling` call `AccessApi.hasPermission(userId, permission)` in each use case.
3. **Interim permission table inside this feature** — grant permissions from a table owned by this feature until the roles/permissions feature ships.

## Decision outcome

**Chosen:** Option 1. One lookup per request satisfies AC-14 (every action is a request), keeps modules free of an edge to a module that does not exist yet, and makes multi-permission checks (import, redaction decisions on the board) a set lookup. Option 3 would duplicate a feature the PRD names as a non-goal.

## Consequences

**Positive**
- No new module edges; modules depend only on `@arv/kernel`'s `Actor`/`CurrentActor` (already the case).
- Redaction of leave type and employment end date can be decided anywhere in a request from one permission set.
- Tests construct actors with any permission set — no access stub per module.

**Negative**
- `Actor.User` in `@arv/kernel` changes shape (adds the permission set); `identity` and the host middleware change with it.
- One permission lookup per authenticated request, even for requests that need none.
- Launch is blocked until both the authentication source and the roles/permissions feature exist; development uses a stub permission source.

**Neutral**
- Permission identifiers are strings owned by the module that checks them (e.g. `scheduling:edit-allocations`); the roles/permissions feature stores and grants them, it does not define their meaning.

## Links

- PRD: [[../PRD.md]] §6.1, AC-03, AC-12b, AC-14, AC-22, AC-29, AC-33
- SAD: [[../sad.md]] §4, §8
- Related ADR: [[0003-split-into-org-projects-scheduling-modules]]
