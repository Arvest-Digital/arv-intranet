# arv-intranet

Intranet app on Cloudflare Workers. A React Router frontend talks to a private Hono + Effect API over a service binding, and the API talks to Postgres (Neon) through Hyperdrive.

```
browser ──► web Worker ──service binding──► api Worker ──► Hyperdrive ──► Neon Postgres 18
            (React Router SSR,              (Hono routes,
             loaders / actions)              Effect services)
```

- **web** is the only public Worker. **api** has no public URL (`workers_dev: false`), so only web can call it.
- The Worker-to-Worker call stays inside Cloudflare and is typed end to end through `@arv/contracts`.
- The api is a **modular monolith**: business modules under `modules/` (hexagonal: domain, application, adapters), composed by a thin host. **Read [`ARCHITECTURE.md`](ARCHITECTURE.md) before any structural change.**

## Contents

- [Tech stack](#tech-stack)
- [File structure](#file-structure)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Parts of the app](#parts-of-the-app)
  - [apps/web: frontend](#appsweb-frontend)
  - [apps/api: host](#appsapi-host)
  - [modules: business modules](#modules-business-modules)
  - [packages/contracts: shared schemas](#packagescontracts-shared-schemas)
  - [packages/kernel and packages/platform](#packageskernel-and-packagesplatform)
  - [packages/db and packages/migrations: database](#packagesdb-and-packagesmigrations-database)
  - [packages/tsconfig](#packagestsconfig)
  - [e2e: end-to-end tests](#e2e-end-to-end-tests)
- [Testing](#testing)
- [Adding a feature](#adding-a-feature)
- [Code style](#code-style)
- [Deploying](#deploying)
- [Notes and gotchas](#notes-and-gotchas)

## Tech stack

| Area | Tools |
|---|---|
| Frontend | React 19, React Router 7.18 (framework mode, SSR), Vite 7 |
| Backend | Hono 4, Effect 3 (services, Layers, typed errors, Schema) |
| Database | Postgres 18, Drizzle ORM + drizzle-kit, `pg` driver, Cloudflare Hyperdrive |
| Platform | Cloudflare Workers, Wrangler, `@cloudflare/vite-plugin` |
| Tests | Vitest 4, `@cloudflare/vitest-plugin` (workerd), Testing Library, Playwright |
| Tooling | pnpm 11 workspaces, Turborepo, Biome, TypeScript 5.9, Docker |

## File structure

```
arv-intranet/
├── apps/
│   ├── web/              # Frontend Worker: React Router 7 (SSR)
│   │   ├── app/features/ #   one folder per module: routes, components, typed client
│   │   ├── app/shared/   #   code shared by features
│   │   └── workers/      #   Worker entry
│   └── api/              # Backend Worker (private): host only, composes the modules
│       ├── src/          #   entry point, composition root, middleware
│       └── test/         #   integration tests per module (workerd + Postgres)
├── modules/
│   ├── identity/         # Users; resolves the actor of each request
│   └── _template/        # Copied by `pnpm new:module <name>`
├── packages/
│   ├── contracts/        # Effect schemas + errors shared by api and web
│   ├── kernel/           # Shared branded IDs, Actor, ports (UnitOfWork, DomainEvents)
│   ├── platform/         # HTTP plumbing for modules: runEffect, validate, error mapping
│   ├── db/               # Database service, query(), test helpers. No tables.
│   ├── migrations/       # drizzle-kit config, SQL migrations, db:* scripts
│   └── tsconfig/         # Shared TypeScript config
├── e2e/                  # Playwright browser tests
├── scripts/              # new-module, check-module-graph
├── docs/adr/             # Architecture decision records
├── ARCHITECTURE.md       # How the code is structured, and why
├── docker-compose.yml    # Local Postgres 18 (arv + arv_test)
└── .github/              # CI, CODEOWNERS
```

Each part is described in more detail in [Parts of the app](#parts-of-the-app).

## Getting started

Requirements: Node 22+, pnpm 11 and Docker.

```sh
pnpm install
cp .env.example .env
docker compose up -d --wait   # Postgres 18 with `arv` (dev) and `arv_test` databases
pnpm db:migrate
pnpm dev                      # http://localhost:5173 (web + api together)
```

`pnpm dev` also starts the Postgres container, so after the first setup it is the only command you need. Stop Postgres with `docker compose stop` (data is kept). To reset it completely, run `docker compose down -v`, then `docker compose up -d --wait && pnpm db:migrate`.

## Scripts

All scripts run from the repo root.

| Command | What it does |
|---|---|
| `pnpm dev` | Starts Postgres and the web dev server. The api runs inside it as an auxiliary Worker |
| `pnpm typecheck` | TypeScript across all packages |
| `pnpm lint` / `pnpm format` | Biome check (including layer boundaries) + module graph check / Biome autofix |
| `pnpm check:modules` | Checks module dependencies against the graph in `ARCHITECTURE.md` |
| `pnpm new:module <name>` | Creates `modules/<name>` from the template |
| `pnpm test` | Unit tests (modules, contracts, web). No database needed |
| `pnpm test:integration` | API integration tests against `arv_test`. Needs Docker Postgres |
| `pnpm test:e2e` | Playwright browser tests against the full stack. Needs Docker Postgres |
| `pnpm test:all` | All three test levels in order |
| `pnpm db:generate` | Generate a SQL migration from schema changes |
| `pnpm db:migrate` | Apply pending migrations (`DATABASE_URL`) |
| `pnpm db:status` | Show applied and pending migrations, like `artisan migrate:status` |
| `pnpm db:studio` | Open Drizzle Studio |
| `pnpm build` | Build both Workers (api runs as a deploy dry-run) |
| `pnpm deploy` | Deploy api, then web |

---

## Parts of the app

### apps/web: frontend

A React Router 7 app in framework mode, server-rendered on a Cloudflare Worker. Code is grouped by module under `app/features/<module>/`.

**How a request flows**

1. `workers/app.ts` receives the request and passes `{ cloudflare: { env, ctx } }` as the loader context.
2. React Router matches a route from `app/routes.ts` and runs its `loader` (GET) or `action` (form POST) on the server.
3. The loader calls the feature's gateway, e.g. `identityGateway(context.cloudflare.env.API).listUsers()` from `features/identity/identity.server.ts`.
4. The gateway calls the API with a typed client (`hc<IdentityRoutes>`), decodes the response with a schema from `@arv/contracts/<module>`, and returns an `ApiResult`: the value, or an error message ready for the UI.
5. The component renders the data it receives as `loaderData` / `actionData` props.

**Conventions**

- **All data goes through the API.** Web never imports `@arv/db`, `@arv/kernel`, `@arv/platform` or a module package (Biome enforces this).
- **Features don't import each other.** Shared code goes in `app/shared/`.
- **Server-only code** goes in files ending in `.server.ts`. React Router keeps them out of the browser bundle.
- **Typed client per feature.** `hc<IdentityRoutes>` is typed from the identity module's routes, re-exported by `@arv/api`. Changing a route or schema in the API shows up as a type error here.
- **Always decode responses** with the contract schema rather than trusting `res.json()`.
- **Forms** use React Router's `<Form method="post">` plus an `action`. API error messages come back in `actionData.error`.
- **Route types** (`./+types/<route>`) are generated by `react-router typegen`, which runs as part of `pnpm typecheck` and `pnpm dev`.

**Adding a page:** create `app/features/<module>/routes/<name>.tsx`, register it in `app/routes.ts`, and add a `<name>.test.tsx` next to it.

### apps/api: host

A Hono app on a private Worker. It holds **no business logic**: it authenticates the request, builds the per-request Effect Layer from the module Layers, and mounts the module routers.

| File | Responsibility |
|---|---|
| `src/index.ts` | Middleware, mounts module routers, re-exports route types (`IdentityRoutes`) for web |
| `src/composition.ts` | The only place that knows every module: stacks module Layers in dependency order; `makeAppLayer(env, actor)` |
| `src/middleware/authenticate.ts` | Resolves the actor through `IdentityApi.resolveActor` |
| `src/middleware/provide-app-layer.ts` | Puts the app Layer on the Hono context, where `runEffect` reads it |
| `src/env.ts` | Bindings (`HYPERDRIVE`), declared by hand because web type-imports this app and has its own global `Env`. Keep in sync with `wrangler.jsonc`. |

**Authentication** is not decided yet (see `docs/adr/0001-modular-monolith.md`). Every request currently gets an anonymous actor.

**Error responses** all have the same shape, `{ error: { _tag, message } }` (`ApiErrorBody`):

| Error | Status |
|---|---|
| `ValidationError` (from `validate`) | 400 |
| `NotFound` | 404 |
| `Conflict` | 409 |
| Defects (database failures, bugs), uncaught exceptions | 500, details logged and never sent to the client |

Modules map their own domain errors (e.g. `EmailTaken`) to these contract errors in their `http/presenter.ts`.

### modules: business modules

Each module (`@arv/<name>`) owns one business capability end to end, from HTTP route to Postgres schema. Every module has the same layout:

| Folder | Contents |
|---|---|
| `src/domain/` | Entities, domain errors, events. Pure: imports only `effect` and `@arv/kernel`. |
| `src/application/` | `ports.ts` (repository tags), one file per use case, `<name>-api.ts` (facade for other modules) |
| `src/infrastructure/` | `schema.ts` (`pgSchema('<name>')` tables) and Drizzle repositories implementing the ports |
| `src/http/` | `routes.ts` (Hono sub-app) and `presenter.ts` (domain → DTO, domain error → contract error) |
| `src/layer.ts`, `src/index.ts` | The module's Layer; its public API (facade tag) |

A module exports only `.` (facade), `./http` (router + route type) and `./layer`. Other modules call it only through its facade, and only along edges listed in `ARCHITECTURE.md`. See [ARCHITECTURE.md](ARCHITECTURE.md) for the import rules, the module graph and how-tos.

### packages/contracts: shared schemas

The single source of truth for data that crosses the api ↔ web boundary. It ships as TypeScript source with no build step.

- **Subpaths:** `@arv/contracts/shared` (`NotFound`, `Conflict`, `ApiErrorBody`) and one per module, e.g. `@arv/contracts/identity` (`User`, `CreateUserInput`, `UserIdParam`).
- **Schemas** (`Schema.Struct`) describe both the runtime validation and the TypeScript type. `typeof User.Type` is the decoded value (e.g. `createdAt: Date`); `typeof User.Encoded` is the JSON on the wire (`createdAt: string`).
- **The API** uses them to validate requests and encode responses. **The web app** uses them to decode responses.

Keep this package free of DB, Hono and React imports, and of domain logic. It may only depend on `effect`.

### packages/kernel and packages/platform

- **`@arv/kernel`** (depends on `effect` only): branded IDs shared across modules (`UserId`), `Actor` and the `CurrentActor` tag, the `DomainEvent` base schema, and the `UnitOfWork` and `DomainEvents` ports. No implementations.
- **`@arv/platform/http`**: `runEffect` (runs a route's Effect with the app Layer from the Hono context and maps the result to a response), `validate` (Hono validator backed by an Effect Schema), `toHttpError`, `errorBody`, and the `HttpEnv` type module routers use. It never imports a module or `apps/*`.

### packages/db and packages/migrations: database

**`@arv/db`** is runtime only and defines no tables:

- `Database`: an Effect Tag providing the Drizzle instance. `DatabaseLive(connectionString)`: a Layer that creates a lazy `pg.Pool`.
- `query((db) => promise)`: runs a Drizzle query on the request's `Database` and turns failures into `DbError`. Repositories turn `DbError` into a defect with `Effect.orDie`.
- `@arv/db/migrate`: applies migrations (test setup).
- `@arv/db/testing`: helpers shared by integration and e2e tests:
  - `connectDb`, `resetDatabase`: open a connection; truncate every application table (tables are discovered from `information_schema`, so there's nothing to register).
  - `makeUser`, `seedUsers`: a factory with unique defaults, and inserts into `identity.users`.

**Tables** live in each module's `src/infrastructure/schema.ts`, in the module's own Postgres schema (`pgSchema('identity')`). Columns are camelCase in TypeScript and snake_case in SQL (`casing: 'snake_case'`). No foreign keys or joins across module schemas.

**`@arv/migrations`** owns `drizzle.config.ts`, the `drizzle/` SQL migrations and the `db:*` scripts. drizzle-kit loads `modules/*/src/infrastructure/schema.ts` by path, so no package depends on it. Commit migrations, and never edit one that has already been applied anywhere (`db:status` reports that as **Changed**).

**IDs** are UUIDv7 (`default(sql\`uuidv7()\`)`, Postgres 18+). They're time-ordered, which keeps index inserts sequential.

**Migration workflow**

```sh
# 1. edit modules/<name>/src/infrastructure/schema.ts
#    (new module schema? add it to schemaFilter in packages/migrations/drizzle.config.ts)
pnpm db:generate          # 2. writes packages/migrations/drizzle/NNNN_<name>.sql. Review the SQL.
pnpm db:migrate           # 3. apply to your dev DB
pnpm db:status            # 4. confirm everything shows "Ran"
```

Test databases are migrated automatically when integration or e2e tests start.

`db:status` statuses and their meaning:

| Status | Meaning |
|---|---|
| Ran | Applied, and the file is unchanged |
| Pending | Not applied yet; `db:migrate` will apply it |
| Skipped | Not applied and **will never be**, because it's older than the latest applied migration (usually after a branch merge). Regenerate it. |
| Changed | The file was edited after it was applied |
| Missing file | Applied in the DB, but there's no file in the repo |

`db:status` exits with 0 when up to date, 1 when something needs attention, and 2 when it can't connect.

### packages/tsconfig

Shared `base.json` (strict mode, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, bundler resolution). Every package extends it and adds its own `types` / `lib`.

### e2e: end-to-end tests

Playwright tests that drive a real browser against the full stack: web + api + Postgres. See [Testing → E2E](#e2e-tests-e2etests).

---

## Testing

There are four kinds of tests. Faster tests should catch most bugs; slower tests prove the pieces work together.

| Kind | Location | Runs in | Database | Speed | Command |
|---|---|---|---|---|---|
| Contract | `packages/contracts/src/**/*.test.ts` | Node | No | ms | `pnpm test` |
| Module unit | `modules/*/src/**/*.test.ts` | Node | No (in-memory ports) | ms | `pnpm test` |
| Web | `apps/web/app/**/*.test.tsx` | jsdom | No (fake API) | ms | `pnpm test` |
| API integration | `apps/api/test/integration/<module>/*.test.ts` | workerd | `arv_test` | seconds | `pnpm test:integration` |
| E2E | `e2e/tests/*.spec.ts` | Chromium | `arv_test` | ~10 s | `pnpm test:e2e` |

### Which test should I write?

| You changed… | Write or update |
|---|---|
| A schema in `contracts` with rules (patterns, lengths, transforms) | Contract test |
| A use case or domain rule in a module | Module unit test |
| How a module maps domain values or errors to the wire (`presenter.ts`) | Module unit test |
| A repository query, table or migration | API integration test |
| A route, its validation, or error → status mapping | API integration test |
| A component | Web component test |
| A loader or action | Web route test |
| A user-facing flow across pages / the whole stack | E2E test (only for important flows) |

As a rule of thumb, every bug fix gets a test at the **lowest level that reproduces it**.

### Contract tests (`packages/contracts`)

**What:** schema decode/encode behaviour, i.e. what is accepted, what is rejected, and how values transform (e.g. ISO string ↔ `Date`).

**Write when:**
- You add a schema with refinements (`pattern`, `maxLength`, `NonEmptyTrimmedString`) or transforms (`DateFromString`).
- You fix a validation bug.

You don't need tests for plain `Schema.String` fields.

**Run:** `pnpm test`, or in watch mode while editing:

```sh
pnpm --filter @arv/contracts exec vitest
```

### Module unit tests (`modules/*/src/**/*.test.ts`)

**What:** domain rules and use cases in isolation. Ports are replaced by in-memory Layers (`Layer.succeed(UserRepository, {...})`), so there's no database, no HTTP and no Workers runtime. Presenters (DTO encoding, error mapping) are tested here too.

**Write when:**
- You add or change a use case or a domain rule.
- You add a new failure path (a new domain error).
- Cover the happy path and **every domain error the use case can fail with**. Database failures are defects, so there's nothing to cover for them here.

**Pattern** (see `modules/identity/src/application/users.test.ts`):

```ts
const result = await run(createUser({ email: ann.email, name: 'Ann 2' }));
expect(Either.isLeft(result) && result.left._tag).toBe('EmailTaken');
```

**Run:** continuously while developing. They take milliseconds and need nothing running.

```sh
pnpm --filter @arv/identity exec vitest                                        # watch mode
pnpm --filter @arv/identity exec vitest run src/application/users.test.ts       # one file
```

### Web tests (`apps/web/app/**/*.test.tsx`)

**What:**
- **Components** rendered with Testing Library.
- **Loaders and actions** called directly with a fake `API` binding (`fakeApi` in `app/test/fake-api.ts`), so you can check which request was sent and how responses and errors are handled.
- **Pages** rendered through `createRoutesStub` with a stubbed loader.

**Write when:**
- You add a component with conditional rendering (empty state, errors, formatting).
- You add or change a loader or action, covering both the success path and the API-error path.
- You change how API errors are shown to the user.

**Pattern:**

```ts
const api = fakeApi(() => json({ error: { _tag: 'Conflict', message: 'Email taken' } }, 409));
const result = await action(args({ context: api.context, request }));
expect(result).toMatchObject({ data: { error: 'Email taken' }, init: { status: 409 } });
```

**Run:** with `pnpm test`, or in watch mode while building UI:

```sh
pnpm --filter @arv/web exec vitest
```

### API integration tests (`apps/api/test/integration`)

**What:** real HTTP requests to the real api Worker, running inside **workerd** (the actual Workers runtime), going through Hyperdrive to a real Postgres (`arv_test`). This is the only level that proves the SQL, constraints, migrations, validation and status codes all work together.

**Setup:**
- Migrations run once per test run (`test/global-setup.ts`).
- Each test starts with empty tables (`beforeEach(resetDb)`).
- Files run one at a time because they share the database.
- Tests live in one folder per module: `test/integration/<module>/`.

**Write when:**
- You add an endpoint. Cover success, 400 (invalid input), 404/409 where they apply, and the response shape.
- You add or change a repository query, a table or a migration.
- You change error mapping or validation.

**Seed more than one row.** With a single row, a query missing its `WHERE` clause still returns the "right" answer. The existing tests seed several users for exactly this reason.

**Pattern:**

```ts
await withDb((db) => seedUsers(db, [makeUser(), makeUser({ email: 'ann@arvest.digital' })]));
const res = await postJson('/users', { email: 'ann@arvest.digital', name: 'Ann' });
expect(res.status).toBe(409);
```

**Run:** before pushing, and whenever you touch repositories, schema, migrations or routes. Requires Postgres:

```sh
docker compose up -d --wait
pnpm test:integration
pnpm --filter @arv/api exec vitest run --config vitest.integration.config.ts identity  # one module
```

Point at another database with `TEST_DATABASE_URL`.

### E2E tests (`e2e/tests`)

**What:** a real browser (Chromium) using the real app. Playwright starts the dev server on port 5175 with the API's Hyperdrive pointed at `arv_test` (through the `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` variable). Each test resets the DB and seeds what it needs. This covers what the lower levels can't: the service binding, SSR, hydration, forms and navigation.

**Write when:**
- You add a **critical user flow**: something that must never break, like logging in or creating the core entities.
- You change wiring that lower-level tests can't see: wrangler bindings, `workers/app.ts`, `vite.config.ts`, `entry.server.tsx`.

Keep the suite **small**: one test per important flow, not one per edge case. Edge cases belong in unit and integration tests.

**Write tests the way a user sees the page.** Select elements with `getByRole` and `getByLabel`, not CSS selectors.

**Run:** before merging a PR that changes user-facing behaviour or app wiring. You don't need to run them for every small change. Requires Postgres and a free port 5175:

```sh
pnpm test:e2e
pnpm --filter @arv/e2e exec playwright test --ui       # interactive runner
pnpm --filter @arv/e2e exec playwright test --headed   # watch the browser
```

On the first run on a new machine, install the browser with `pnpm --filter @arv/e2e exec playwright install chromium`.

### When to run what

| Moment | Run |
|---|---|
| While coding | Unit/web tests in watch mode for the package you're in |
| Before committing | `pnpm lint && pnpm typecheck && pnpm test` |
| Before pushing / opening a PR | Add `pnpm test:integration`. Add `pnpm test:e2e` if user flows or wiring changed |
| CI (every push to main and every PR) | Everything: lint → typecheck → unit → integration → e2e, against Postgres 18 |

---

## Adding a feature

**New capability in an existing module** (example: deactivating a user in `identity`):

1. **Contract:** add the DTOs to `packages/contracts/src/identity/`. Add a contract test if there are rules.
2. **Domain:** new rules and errors in `modules/identity/src/domain/`.
3. **Use case:** `modules/identity/src/application/deactivate-user.ts`, plus a unit test with in-memory ports. Extend the port in `ports.ts` if needed.
4. **Adapter:** implement new port methods in `infrastructure/`. New table or column? Edit `schema.ts`, then `pnpm db:generate`, review, `pnpm db:migrate`.
5. **Route:** add it to `http/routes.ts` and map new domain errors in `presenter.ts`. Add an integration test in `apps/api/test/integration/identity/`.
6. **Page:** `apps/web/app/features/identity/routes/<name>.tsx`, registered in `app/routes.ts`, with a route test. Add gateway functions to `identity.server.ts`.
7. **E2E:** only if it's a critical flow.

**New module** (example: `org`): run `pnpm new:module org` and follow the printed steps. The full checklist is in [ARCHITECTURE.md → How-to](ARCHITECTURE.md#how-to).

## Code style

Biome handles both linting and formatting:
- Single quotes in TS/JS; double quotes for JSX attributes.
- 2-space indentation, 100-character lines.
- Imports are sorted automatically.

Run `pnpm format` before committing; CI runs `pnpm lint`. Non-null assertions (`!`) are allowed in test files only.

`pnpm lint` also enforces the architecture: Biome overrides in `biome.json` forbid imports that cross a module layer (e.g. `hono` in `domain/`, `@arv/db` in `http/`, any module package in web), and `pnpm check:modules` checks module dependencies against the graph in `ARCHITECTURE.md`.

## Deploying

1. Create a Neon project on **Postgres 18**. `uuidv7()` doesn't exist in older versions.
2. Create the Hyperdrive config:

   ```sh
   wrangler hyperdrive create arv-db --connection-string="<neon url>" --caching-disabled
   ```

   Query caching stays off so reads right after a write see it. Put the returned id in `apps/api/wrangler.jsonc`.
3. Apply and check migrations against Neon's **direct** (non-pooled) URL:

   ```sh
   DATABASE_URL=<neon direct url> pnpm db:migrate
   DATABASE_URL=<neon direct url> pnpm db:status
   ```

4. Run `pnpm deploy`. Turbo deploys the api before web, because web's service binding needs `arv-api` to exist.

For a breaking contract change, deploy an API that accepts both the old and new shapes first, then deploy web.

## Notes and gotchas

- **After editing a `wrangler.jsonc`**, regenerate types with `pnpm --filter @arv/api cf-typegen` or `pnpm --filter @arv/web cf-typegen`.
- **DB connections are not closed explicitly.** This follows Cloudflare's Hyperdrive + node-postgres guidance: the runtime drops sockets when the request ends, and closing them by hand causes "socket has been closed" errors.
- **Pinned versions.** Newer majors exist (React Router 8, Effect 4, TypeScript 7), but the current stack is pinned for compatibility: React Router 7 requires TypeScript below 7, and the Workers test plugin requires Vitest 4. Upgrade them together, deliberately.
- **Release-age policy.** pnpm 11 has a minimum release age by default. Freshly published versions get flagged at install time, and pnpm adds them to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`. Prefer versions that are at least a few days old over adding exclusions.
- **`AGENTS.md`** is generated and maintained by Turborepo. Leave it in place.
