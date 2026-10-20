# 0001: Modular monolith with hexagonal modules

- Status: accepted
- Date: 2026-10-20

## Context

The intranet will grow to many business domains (people and departments, documents, requests and approvals, booking, news, …). The original api had one layered app (`routes → services → repositories`) with every table in one package. As domains are added, that layout couples unrelated code, makes ownership unclear, and means every change risks touching everything.

We want strong boundaries between domains without paying for microservices now: there is one small team, one database, and two Workers.

## Decision

- The api becomes a **modular monolith**: one deployable Worker, split into business modules under `modules/<name>`, each a pnpm workspace package. `apps/api` is a thin host that composes them.
- Each module is **hexagonal**: `domain` (pure), `application` (use cases, ports, facade), `infrastructure` (Drizzle adapters), `http` (Hono routes, presenter). Effect `Context.Tag`s are the ports and `Layer`s the adapters.
- Modules talk only through another module's **facade** (its root export) or, later, through **domain events** via an outbox. The allowed module graph is listed in `ARCHITECTURE.md` and checked by `pnpm check:modules`.
- Shared runtime code lives below the modules: `@arv/kernel` (shared IDs, `Actor`, ports), `@arv/platform` (`runEffect`, `validate`, error mapping), `@arv/db` (`Database`, `query`), `@arv/contracts` (wire DTOs). Migrations live in the leaf package `@arv/migrations`, which loads module schema files by path. The package graph is acyclic.
- **One Postgres schema per module**, no foreign keys or joins across schemas.
- **Database failures are defects** (`Effect.orDie` in adapters → 500). Ports have no database error channel; domain errors are mapped to shared contract errors in each module's presenter.
- Layer boundaries are enforced with **Biome `noRestrictedImports` overrides** (no new dependency).
- The web app mirrors modules as **feature folders**, each with its own typed client.

## Options considered

- **Folders inside `apps/api`** instead of packages: simpler, but boundaries would rest on lint alone. Rejected; packages make undeclared imports fail to resolve.
- **Keep database errors typed (`DbError`)** in every signature: honest types, but every port and use case carries an error nobody handles except as a 500. Rejected.
- **Foreign keys across modules:** database-level integrity, but a module could no longer move to its own database. Rejected; checks go through facades and lifecycle events.
- **dependency-cruiser** for boundary checks: more expressive, but a new tool. Deferred; Biome covers today's rules.

## Consequences

- Adding a domain is `pnpm new:module <name>` plus a few registration steps (see `ARCHITECTURE.md` → How-to).
- Any module can later move to its own Worker (facade adapter over a service binding) or its own database.
- `runEffect` can't check at compile time that the host provides every service a route needs; a missing Layer is a 500 at run time, caught by integration tests.
- Integrity between modules is the application's job, not the database's.

## Open questions

- **Domain list.** Only `identity` exists today. The real list of modules and the edges between them must be agreed by the team before more modules are added; `ARCHITECTURE.md` shows examples.
- **Authentication source.** Cloudflare Access JWT, an SSO provider, or our own sessions. Until it's decided, `IdentityApi.resolveActor` returns an anonymous actor for every request and does not read the token.
- **Events.** The `UnitOfWork` and `DomainEvents` ports exist; the outbox, Cron relay and Queue consumer are added with the first asynchronous use case.
