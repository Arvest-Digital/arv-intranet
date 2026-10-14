# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

pnpm + Turborepo monorepo, everything runs on Cloudflare Workers:

browser → `@arv/web` (React Router 7 SSR) → service binding `API` → `@arv/api` (Hono + Effect 3, private) → Hyperdrive binding `HYPERDRIVE` → Postgres 18 (Neon in prod, docker locally).

- `packages/contracts` — Effect Schemas + tagged errors shared by api and web.
- `packages/db` — Drizzle schema, migrations (`packages/db/drizzle/`), test helpers (`@arv/db/testing`).
- Internal packages are consumed as TS source (no build step). Web depends on `@arv/api` only to type the Hono RPC client.

## Commands

- `pnpm dev` starts docker Postgres and the web dev server (api runs as an auxiliary worker).
- `pnpm lint` / `pnpm format` — Biome (no ESLint/Prettier). `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm test:all`.
- Target one workspace with `pnpm --filter @arv/<name> <script>`.
- Single tests:
  - `pnpm --filter @arv/api exec vitest run src/services/user-service.test.ts`
  - `pnpm --filter @arv/api exec vitest run --config vitest.integration.config.ts users` (workerd + real `arv_test` DB, needs docker up)
  - `pnpm --filter @arv/e2e exec playwright test` (first time: `pnpm --filter @arv/e2e exec playwright install chromium`)
- DB: `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:status`.