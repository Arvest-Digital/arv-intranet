# arv-intranet

Intranet app on Cloudflare Workers. A React Router frontend talks to a private Hono + Effect API over a service binding, and the API talks to Postgres (Neon) through Hyperdrive.

```
browser ──► web Worker ──service binding──► api Worker ──► Hyperdrive ──► Neon Postgres 18
            (React Router SSR,              (Hono routes,
             loaders / actions)              Effect services)
```

- **web** is the only public Worker. **api** has no public URL (`workers_dev: false`), so only web can call it.
- The Worker-to-Worker call stays inside Cloudflare and is typed end to end through `@arv/contracts`.

## Contents

- [Tech stack](#tech-stack)
- [File structure](#file-structure)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Parts of the app](#parts-of-the-app)
  - [apps/web: frontend](#appsweb-frontend)
  - [apps/api: backend](#appsapi-backend)
  - [packages/contracts: shared schemas](#packagescontracts-shared-schemas)
  - [packages/db: database](#packagesdb-database)
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
│   │   ├── app/          #   routes, components, typed API client
│   │   └── workers/      #   Worker entry
│   └── api/              # Backend Worker: Hono + Effect (private)
│       ├── src/          #   http routes → services → repositories
│       └── test/         #   integration tests (workerd + Postgres)
├── packages/
│   ├── contracts/        # Effect schemas + errors shared by api and web
│   ├── db/               # Drizzle schema, migrations, Database service, test helpers
│   └── tsconfig/         # Shared TypeScript config
├── e2e/                  # Playwright browser tests
├── docker-compose.yml    # Local Postgres 18 (arv + arv_test)
└── .github/workflows/    # CI
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
| `pnpm lint` / `pnpm format` | Biome check / Biome autofix |
| `pnpm test` | Unit tests (contracts, api, web). No database needed |
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

A React Router 7 app in framework mode, server-rendered on a Cloudflare Worker.

**How a request flows**

1. `workers/app.ts` receives the request and passes `{ cloudflare: { env, ctx } }` as the loader context.
2. React Router matches a route from `app/routes.ts` and runs its `loader` (GET) or `action` (form POST) on the server.
3. The loader calls the API with `createApiClient(context.cloudflare.env.API)`.
4. The response is decoded with a schema from `@arv/contracts`, for example to turn ISO strings back into `Date`s.
5. The component renders the data it receives as `loaderData` / `actionData` props.

**Conventions**

- **All data goes through the API.** Never import `@arv/db` in web; the API is the only thing that touches the database.
- **Server-only code** goes in files ending in `.server.ts`. React Router keeps them out of the browser bundle.
- **Typed client.** `api.users.$get()` and `api.users.$post({ json })` are typed from the API's routes. Changing a route or schema in the API shows up as a type error here.
- **Always decode responses** with the contract schema (`Schema.decodeUnknownSync(User)`) rather than trusting `res.json()`.
- **Forms** use React Router's `<Form method="post">` plus an `action`. API error messages come back in `actionData.error`.
- **Route types** (`./+types/<route>`) are generated by `react-router typegen`, which runs as part of `pnpm typecheck` and `pnpm dev`.

**Adding a page:** create `app/routes/<name>.tsx`, register it in `app/routes.ts`, and add a `<name>.test.tsx` next to it.

### apps/api: backend

A Hono app on a private Worker. Business logic is written with Effect.

**Layers, from outside in**

| Layer | Location | Responsibility |
|---|---|---|
| Route | `src/http/routes/*.ts` | Validates input (`validate('json', Schema)`), calls a service, encodes output. No logic. |
| `runEffect` | `src/http/effect-handler.ts` | Provides the per-request Layer, runs the Effect, maps the result to a JSON response |
| Service | `src/services/*.ts` | Domain rules (e.g. "email must be unique"). Fails with typed errors. |
| Repository | `src/repositories/*.ts` | Drizzle queries only, wrapped in `query()` so failures become `DbError` |
| Database | `@arv/db` (`DatabaseLive`) | One `pg.Pool` per request on the Hyperdrive connection string |

**Error handling.** Services fail with tagged errors, and `toHttpError` in `src/http/errors.ts` maps them to HTTP responses. Every error response has the same shape: `{ error: { _tag, message } }` (`ApiErrorBody`).

| Error | Status |
|---|---|
| `ValidationError` (from `validate`) | 400 |
| `NotFound` | 404 |
| `Conflict` | 409 |
| `DbError`, defects, uncaught exceptions | 500, details logged and never sent to the client |

To add a new error: define it in `contracts/src/errors.ts`, add it to `AppError`, and handle it in `toHttpError`. The `switch` is exhaustive, so TypeScript reminds you.

**Dependency injection.** Services and repositories are `Context.Tag`s with `Layer` implementations. `src/layers.ts` wires them together for each request. Register a new service in both `makeAppLayer` and the `AppServices` type.

**Bindings.** `src/env.ts` declares the bindings (`HYPERDRIVE`) by hand. It isn't generated, because web type-imports this app and has its own global `Env`. Keep it in sync with `wrangler.jsonc`.

### packages/contracts: shared schemas

The single source of truth for data that crosses the api ↔ web boundary. It ships as TypeScript source with no build step.

- **Schemas** (`Schema.Struct`) describe both the runtime validation and the TypeScript type. `typeof User.Type` is the decoded value (e.g. `createdAt: Date`); `typeof User.Encoded` is the JSON on the wire (`createdAt: string`).
- **The API** uses them to validate requests and encode responses. **The web app** uses them to decode responses.
- **Errors** are `Schema.TaggedError` classes, so they're serializable and identified by `_tag`.

Keep this package free of DB, Hono and React imports. It may only depend on `effect`.

### packages/db: database

Drizzle schema, migrations and the Effect database service.

- **`src/schema/`**: table definitions. They're the source of truth, and migrations are generated from them. Columns are camelCase in TypeScript and snake_case in SQL (`casing: 'snake_case'`).
- **`src/database.ts`**:
  - `Database`: an Effect Tag providing the Drizzle instance.
  - `DatabaseLive(connectionString)`: a Layer that creates a lazy `pg.Pool`.
  - `query(() => promise)`: turns Drizzle failures into `DbError`.
- **`drizzle/`**: generated migrations. Commit them, and never edit one that has already been applied anywhere (`db:status` reports that as **Changed**).
- **`src/testing/`**: helpers shared by integration and e2e tests:
  - `connectDb`, `resetDatabase`: open a connection; truncate all tables.
  - `makeUser`: a factory with unique defaults.
  - `seedUsers`: inserts rows.

  **When you add a table, add it to `resetDatabase`.**

**IDs** are UUIDv7 (`default(sql\`uuidv7()\`)`, Postgres 18+). They're time-ordered, which keeps index inserts sequential.

**Migration workflow**

```sh
# 1. edit packages/db/src/schema/*.ts
pnpm db:generate          # 2. writes drizzle/NNNN_<name>.sql. Review the SQL.
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
| Contract | `packages/contracts/src/*.test.ts` | Node | No | ms | `pnpm test` |
| API unit | `apps/api/src/**/*.test.ts` | Node | No (mocked) | ms | `pnpm test` |
| Web | `apps/web/app/**/*.test.tsx` | jsdom | No (fake API) | ms | `pnpm test` |
| API integration | `apps/api/test/integration/*.test.ts` | workerd | `arv_test` | seconds | `pnpm test:integration` |
| E2E | `e2e/tests/*.spec.ts` | Chromium | `arv_test` | ~10 s | `pnpm test:e2e` |

### Which test should I write?

| You changed… | Write or update |
|---|---|
| A schema in `contracts` with rules (patterns, lengths, transforms) | Contract test |
| Business rules in a service | API unit test |
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

### API unit tests (`apps/api/src/**/*.test.ts`)

**What:** service logic in isolation. Repositories are replaced by in-memory Layers (`Layer.succeed(UserRepo, {...})`), so there's no database, no HTTP and no Workers runtime.

**Write when:**
- You add or change a service method.
- You add a business rule or a new failure path (`NotFound`, `Conflict`, …).
- Cover the happy path and **every typed error the method can fail with**, including `DbError` propagation.

**Pattern** (see `user-service.test.ts`):

```ts
const repo = makeRepo({ findByEmail: () => Effect.succeed(Option.some(ann)) });
const result = await run(Effect.flatMap(UserService, (s) => s.create(input)), repo);
expect(Either.isLeft(result) && result.left._tag).toBe('Conflict');
```

**Run:** continuously while developing. They take milliseconds and need nothing running.

```sh
pnpm --filter @arv/api exec vitest                                      # watch mode
pnpm --filter @arv/api exec vitest run src/services/user-service.test.ts  # one file
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
pnpm --filter @arv/api exec vitest run --config vitest.integration.config.ts users  # one file
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

Example: a "departments" resource.

1. **Contract:** `packages/contracts/src/department.ts` with `Department` and `CreateDepartmentInput` schemas. Export it from `index.ts`. Add a contract test if there are rules.
2. **Table:** `packages/db/src/schema/departments.ts`, then export it from `schema/index.ts` and add the table to `resetDatabase`. Run `pnpm db:generate`, review the SQL, then run `pnpm db:migrate`.
3. **Repository:** `apps/api/src/repositories/department-repo.ts` (Tag + `Layer.effect`, queries wrapped in `query()`).
4. **Service:** `apps/api/src/services/department-service.ts`, plus a unit test with an in-memory repo.
5. **Wiring:** add both Layers to `makeAppLayer`, and add the service to `AppServices` in `src/layers.ts`.
6. **Routes:** `apps/api/src/http/routes/departments.ts`, mounted with `.route('/departments', departmentsRoutes)` in `src/index.ts`. Add an integration test.
7. **Page:** `apps/web/app/routes/departments.tsx`, registered in `app/routes.ts`, with a route test.
8. **E2E:** only if it's a critical flow.

## Code style

Biome handles both linting and formatting:
- Single quotes in TS/JS; double quotes for JSX attributes.
- 2-space indentation, 100-character lines.
- Imports are sorted automatically.

Run `pnpm format` before committing; CI runs `pnpm lint`. Non-null assertions (`!`) are allowed in test files only.

## Deploying

1. Create a Neon project on **Postgres 18**. `uuidv7()` doesn't exist in older versions.
2. Create the Hyperdrive config:

   ```sh
   wrangler hyperdrive create arv-db --connection-string="<neon url>"
   ```

   Put the returned id in `apps/api/wrangler.jsonc`.
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
