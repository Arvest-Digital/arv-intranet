---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-11-03"
feature_size: M
stage: "04-05"
ticket: "TBD"
---

<!-- Format: MADR. Spawned by sdlc:architecture-design (§5 building-block decision, blast-radius 3/3). -->

# 0006 — Keep sign-in, sessions and access roles in one `identity` module

- **Status:** Accepted
- **Date:** 2026-11-03
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

The feature has two halves: who you are (the access list, sign-in, sessions) and what you may do (access roles, grants, the permission catalog). Resource scheduling's SAD referred to a separate «roles/permissions feature», and CONTEXT.md says access roles are assigned «by the roles/permissions feature». The repo gives every module its own Postgres schema and forbids joins and foreign keys across schemas, so where the line falls decides how many queries the per-request check needs and whether the last-admin guard can be one transaction.

## Decision drivers

- QG-2 / PRD §6: ≤ 25 ms p95 for the access check on every request, at 100 users and 50 access roles.
- AC-14: no single action may leave zero admins — removing a user, taking a role, removing manage access from a role, deleting a role.
- AC-07: removing a user removes their access roles and ends every session.
- Repo rule: no cross-schema joins or FKs; new module edges need review.

## Considered options

1. **One `identity` module** — users, sessions, access roles, grants, the catalog port and actor resolution in `modules/identity`, schema `identity`.
2. **Two modules: `identity` + `access`** — identity keeps users, sign-in and sessions; a new `access` module owns roles, grants and the catalog and calls identity's facade.

## Decision outcome

**Chosen:** Option 1. The per-request check becomes one query joining sessions, users and grants, and the last-admin guard and user removal are one transaction with ordinary foreign keys inside one schema. With two modules the check needs two or more round-trips on every request, the last-admin guard needs a cross-module facade command inside a shared unit of work, and the graph gains an edge — all for a split no requirement asks for.

## Consequences

**Positive**
- One round-trip per request for the access check; cascades (user → role assignments, sessions) are plain foreign keys.
- The module graph stays `identity → (none)`.

**Negative**
- `identity` grows two sub-areas in one package; its `application/` must stay organised by use case to remain readable.
- Splitting it later means moving tables between schemas.

**Neutral**
- «The roles/permissions feature» in CONTEXT.md and resource scheduling's SAD is this module; the term needs a `fix-term` touch (SAD §12).

## Links

- PRD: [[../PRD.md]] AC-07, AC-14, §6
- SAD: [[../sad.md]] §5
- Related ADR: [[0005-check-permissions-with-one-kernel-require-permission-over-a-per-request-actor]]
