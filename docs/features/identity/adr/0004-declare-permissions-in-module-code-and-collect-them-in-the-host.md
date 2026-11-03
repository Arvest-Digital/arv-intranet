---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-11-03"
feature_size: M
stage: "04-05"
ticket: "TBD"
---

<!-- Format: MADR. Spawned by sdlc:architecture-design (§4 strategic decision, blast-radius 3/3). -->

# 0004 — Declare permissions in each module's code and collect them in the api host

- **Status:** Accepted
- **Date:** 2026-11-03
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

Each feature declares its own permissions (PRD §1), and admins pick them by plain-language name, one-sentence description and feature (US-04). A permission no feature declares any more is a retired permission: it grants nothing, is flagged on the roles that still list it, cannot be added to a role, and grants again if re-declared under the same name (AC-16); an undeclared permission is never granted (AC-18). Identity is a foundation module that every other module may call, so it must not depend on any feature module (no cycles in the module graph).

## Decision drivers

- AC-16, AC-18; PRD §7 «scheduling unblocked» — six permissions granted through access roles with no scheduling-specific access code.
- Module graph stays acyclic; one Postgres schema per module (SAD §2).
- Resource-scheduling ADR-0004 (neutral consequence): permission keys are owned by the module that checks them; the roles feature stores and grants them, it does not define their meaning.

## Considered options

1. **Declared in module code, collected by the host** — each module exports an array of declarations (key, name, description, feature; type in `@arv/kernel`) from its root; `apps/api/src/composition.ts` builds identity's `PermissionCatalog` port from all of them; identity stores grants by key; retired = granted key not in the catalog, computed on read.
2. **A catalog table seeded by each feature's migrations** — `identity.permissions` rows inserted and retired by SQL migrations owned by each feature.
3. **One central list inside identity** — every permission of every feature in one identity file.

## Decision outcome

**Chosen:** Option 1. The declaration lives next to the code that checks it, the deploy is the single source of truth, identity never imports a feature, and AC-16's «re-declared grants again» needs no migration because grants are stored by key. Option 2 has other features writing into identity's schema and lets code check a key the table doesn't have (caught only at runtime). Option 3 makes the foundation module know every feature's rights and contradicts «each feature declares its permissions».

## Consequences

**Positive**
- Adding a feature's permissions is a code change in that feature plus one line in the host composition — no identity change, no migration.
- Typos are caught early: the shared check only ever grants keys present in the catalog (AC-18), and a host unit test asserts every key is unique across modules.

**Negative**
- Renaming a permission key is a breaking change for access roles (it becomes retired); the module must keep the key and change only the label, or admins must re-grant.
- Labels and descriptions are deploy-time text; changing a label needs a deploy (acceptable: PRD §8 Q1 sets them once before launch).

**Neutral**
- `@arv/kernel` gains a `PermissionDeclaration` type next to the `Permission` key type from resource-scheduling ADR-0004.

## Links

- PRD: [[../PRD.md]] US-04, US-07, AC-09, AC-16, AC-18, §8 Q1
- SAD: [[../sad.md]] §4, §5, §8
- Related ADR: [[0005-check-permissions-with-one-kernel-require-permission-over-a-per-request-actor]], resource-scheduling [[../../resource-scheduling/adr/0004-resolve-permissions-into-actor-per-request]]
