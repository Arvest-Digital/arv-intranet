---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-11-03"
feature_size: M
stage: "04-05"
ticket: "TBD"
---

<!-- Format: MADR. Spawned by sdlc:architecture-design (§4 strategic decision, blast-radius 3/3). Implements resource-scheduling ADR-0004; approves the @arv/kernel, @arv/contracts/shared and @arv/platform changes it needs. -->

# 0005 — Check permissions with one kernel `requirePermission` over a per-request, uncached actor

- **Status:** Accepted
- **Date:** 2026-11-03
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

Resource-scheduling's ADR-0004 decided that the api host resolves the user's permissions on every request and carries them on `Actor.User` in `@arv/kernel`. Identity now owns that resolution and must also give every feature one shared check (PRD Goal 3, US-08) with a uniform refusal (AC-08: «tells the user they lack the permission»). Today `Actor` is `Anonymous | User { id }`, the shared contract errors are only `NotFound` and `Conflict`, and changes to shared packages need explicit approval (CLAUDE.md) — given in this decision.

## Decision drivers

- QG-1 / PRD §6 Revocation: 0 requests accepted after a removal or permission change is confirmed; Fail closed: 100% refused when access cannot be determined.
- QG-2 / PRD §6: ≤ 25 ms p95 for the access check, holding at 100 users and 50 access roles.
- AC-17, AC-18, AC-19; PRD §7 shared-check adoption = 100%.

## Considered options

1. **`requirePermission` in `@arv/kernel`** — `Permission` key type, `Actor.User { id, permissions }`, an Effect `requirePermission(p)` that reads `CurrentActor` and fails with a shared `PermissionDenied` (or `Unauthenticated` for an anonymous actor); `@arv/platform` maps them once to new shared contract errors `Forbidden` (403) and `Unauthorized` (401).
2. **Each module checks the set itself** — modules call `actor.permissions.has(…)` and raise their own domain errors, mapped in their own presenters.
3. **Route-level middleware** — each module's Hono routes declare the required permission; use cases don't check.

In all three, the permission set on the actor is the user's granted keys intersected with the catalog (ADR-0004), resolved by one uncached query per request.

## Decision outcome

**Chosen:** Option 1. One function and one error make «checked only through the shared check» verifiable at review and keep the refusal identical across features; checks sit in use cases, so a use case reached through a facade is protected too. Option 2 multiplies the logic and the 403 messages. Option 3 leaves use cases unprotected when called outside HTTP and still needs the actor inside use cases for redaction decisions (e.g. scheduling's leave reasons).

## Consequences

**Positive**
- No module needs an edge to identity to check access; tests build an `Actor` with any permission set.
- Retired and undeclared permissions can never pass (AC-16, AC-18); manage access grants only itself (AC-19).
- Fail closed by construction: if the resolution query fails it is a defect (500), never a fallback to `Anonymous` with permissions.

**Negative**
- Shared packages change: `@arv/kernel` (`Permission`, `PermissionDeclaration`, `Actor.User.permissions`, `requirePermission`, `PermissionDenied`, `Unauthenticated`), `@arv/contracts/shared` (`Forbidden`, `Unauthorized`), `@arv/platform/http` (their mapping). The existing identity scaffold and its tests change with them.
- One database round-trip per authenticated request even when the action needs no permission; no cache may ever be added in front of it without revisiting this ADR (QG-1 outranks QG-2).

**Neutral**
- Hyperdrive's main config must keep query caching disabled (already a repo rule); a cached config must never serve this query.

## Links

- PRD: [[../PRD.md]] US-08, AC-08, AC-16 – AC-19, §6, §7
- SAD: [[../sad.md]] §4, §5, §8, §10
- Related ADR: [[0003-sign-in-with-google-oidc-and-server-side-sessions]], [[0004-declare-permissions-in-module-code-and-collect-them-in-the-host]], resource-scheduling [[../../resource-scheduling/adr/0004-resolve-permissions-into-actor-per-request]]
