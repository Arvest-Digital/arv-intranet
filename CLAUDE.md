# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Modular monolith on Cloudflare Workers. `ARCHITECTURE.md` is the source of truth for structure; detailed rules live in `.claude/rules/` (backend, frontend, infra).

## Architecture

browser → `@arv/web` (React Router 7 SSR) → service binding `API` → `@arv/api` (Hono 4 + Effect 3, private Worker) → Hyperdrive binding `HYPERDRIVE` → Postgres 18 (Neon in prod, docker locally).

- `apps/api` — host only: wrangler config, middleware (auth → actor, per-request Layer), `composition.ts` (the only place that wires all modules), integration tests. No business logic.
- `apps/web` — UI, organised by feature (`app/features/<module>/`), calls the api through a typed `hc` client per feature.
- `modules/<name>` — one business capability each (`@arv/<name>`), hexagonal: `domain/` → `application/` (ports, use cases, facade) → `infrastructure/` (Drizzle adapters, `schema.ts`) → `http/` (Hono routes, presenter). Own Postgres schema per module. `modules/_template` is the scaffold, not a workspace package.
- `packages/kernel` — shared primitives (ids, `Actor`/`CurrentActor`, domain-event and unit-of-work ports). Depends on `effect` only.
- `packages/platform` — HTTP glue (`runEffect`, validation, contract-error mapping).
- `packages/db` — `Database` tag, connection Layer, `query` helper, `./migrate`, `./testing` (reset, seed). No tables.
- `packages/migrations` — drizzle-kit config + SQL migrations (`drizzle/`); reads every module's `schema.ts`.
- `packages/contracts` — Effect Schemas + tagged errors shared by api and web, per module subpath (`@arv/contracts/identity`, `@arv/contracts/shared`).
- Internal packages are consumed as TS source (no build step).

## Dependency rules

- Direction: `apps → modules → @arv/platform → @arv/db · @arv/kernel · @arv/contracts`. Never import upward; nothing imports from `apps/*`.
- Inside a module: `domain` uses only `@arv/kernel` (no Hono, Drizzle, other layers); `application` has no Hono, Drizzle, `@arv/db`, `@arv/platform` or `@arv/contracts`; only `infrastructure` touches `@arv/db`/Drizzle; `http` never imports `infrastructure`. Enforced by Biome `noRestrictedImports` overrides in `biome.json` — fix the import, don't silence the rule.
- Modules call each other only through the other module's facade (root export of `@arv/<name>`), never its internals, tables or `./layer`. Every module edge must be declared in the `module-graph` block of `ARCHITECTURE.md` (`pnpm check:modules`); ask before adding one, never add a cycle. No foreign keys across module schemas.
- Web imports only `@arv/contracts/*` and `import type` from `@arv/api` — never `@arv/db`, `@arv/kernel`, `@arv/platform` or module packages.
- Code that no module owns: ask, don't park it in `@arv/platform` or `@arv/kernel`.
- Versions are pinned on purpose (TS 5.9 for React Router 7, Vitest 4 for the Workers plugin, Effect 3). Don't bump or add tools/packages without asking; if pnpm's minimum-release-age blocks something, pick an older version.

## Conventions

- Errors: DB failures are defects (`Effect.orDie` → 500); domain errors are tagged and mapped to contract errors (`NotFound`, `Conflict`) in the module's presenter.
- New module: `pnpm new:module <name>`, then register its Layer in `apps/api/src/composition.ts`, mount its routes in `apps/api/src/index.ts`, add it to the module graph and to `schemaFilter` in `packages/migrations/drizzle.config.ts`.
- Tests sit next to the code (`*.test.ts`); api integration tests in `apps/api/test/integration/<module>/`.
- Biome for lint and format (no ESLint/Prettier).
- Git: feature branch + PR, never commit to `main`. Conventional Commits scoped by module or package, e.g. `feat(identity): add user search`, `fix(web): ...`.
- Structural change (module, package, layer, cross-module call, event, table)? Read `ARCHITECTURE.md` first and update it in the same PR.

## Commands

The `Makefile` wraps these (`make` lists targets: `make dev`, `make test`, `make migrate`, `make check`, …); `package.json` scripts stay the source of truth.

- `pnpm dev` — docker Postgres + web dev server (api runs as an auxiliary worker).
- `pnpm lint` (Biome + module graph check) · `pnpm format` · `pnpm typecheck` · `pnpm build`.
- `pnpm test` · `pnpm test:integration` (workerd + real `arv_test` DB, needs docker) · `pnpm test:e2e` · `pnpm test:all`.
- Before committing: `pnpm lint && pnpm typecheck && pnpm test`; also `pnpm test:integration` if a repository adapter, table or migration changed.
- One workspace: `pnpm --filter @arv/<name> <script>`.
- Single tests:
  - `pnpm --filter @arv/identity exec vitest run src/application/users.test.ts`
  - `pnpm --filter @arv/api exec vitest run --config vitest.integration.config.ts users`
  - `pnpm --filter @arv/e2e exec playwright test` (first time: `pnpm --filter @arv/e2e exec playwright install chromium`)
- DB: `pnpm db:generate` · `pnpm db:migrate` · `pnpm db:status` · `pnpm db:studio` (all run in `@arv/migrations`).
- Scaffolding: `pnpm new:module <name>` · `pnpm check:modules`.
