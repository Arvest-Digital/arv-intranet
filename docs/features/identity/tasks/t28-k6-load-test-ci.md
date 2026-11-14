---
id: T28
title: "Add the seeded k6 load test and its CI job for the three latency targets"
layer: "tests"
deps: ["T20", "T23"]
acs: ["AC-01", "AC-17"]
files_hint: ["e2e/load/identity.k6.js", "e2e/load/seed.ts", ".github/workflows/ci.yml", "apps/api/wrangler.jsonc"]
owner: "TBD (backend lead)"
estimate: "L"
status: "review"
---

# T28 — Add the seeded k6 load test and its CI job for the three latency targets

> Layer `tests` · estimate L · blocked by T20, T23 · ACs: AC-01, AC-17 ([PRD §5](../PRD.md))

## Why

PRD §6 Capacity headroom: the latency targets hold at 100 users and 50 roles ([sad §10](../sad.md) Scenario 2c; k6 approved 2026-11-03, sad §11).

## What

- Seed `arv_test` with 100 users, 50 roles and their sessions. Start web and api with `wrangler dev`.
- Thresholds verbatim from PRD §6: the `accessCheck` Server-Timing Trend `p(95)<=25`; sign-in return `http_req_duration` `p(95)<=800`; admin routes `p(95)<=500`.
- A CI job with a pinned k6 version.

Files: `e2e/load/identity.k6.js`, `e2e/load/seed.ts`, `.github/workflows/ci.yml`, `apps/api/wrangler.jsonc`

## Definition of Done

- [ ] The CI job runs the scenario and fails when a threshold is breached (shown once in the PR by a temporarily lowered threshold).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- **Implemented (2026-11-13):** `e2e/load/seed.ts` seeds 100 users (2 admins), 50 access roles (3 per user) and one session each; `e2e/load/identity.k6.js` runs the access-check and admin-action scenarios against the api Worker under `wrangler dev` (called directly with Bearer tokens, so the api's `Server-Timing` is readable; the web isn't started while sign-in is pending). CI job `load`, k6 pinned to 1.3.0. Scripts: `pnpm --filter @arv/e2e load:seed | load:api | load:run`. `apps/api/wrangler.jsonc` is unchanged: test values come from `--var` flags on the job's `wrangler dev`.
- **Local result (2026-11-13, docker Postgres):** admin actions p95 239 ms (target 500 ms, pass). Access check p95 82 ms with 10 VUs and 29 ms with 1 VU (target 25 ms, **fail**). The timed `accessCheck` window includes building the identity Layer and opening a new Postgres connection per request (`DatabaseLive` pool per request).
- **Follow-up, open:** bring the access check under 25 ms p95, or agree with the Tech Lead whether connection setup belongs in the `accessCheck` measurement (sad §7). Until then the k6 step is `continue-on-error` (decided 2026-11-13); remove that once it passes. The DoD's lowered-threshold demonstration is already shown by this breach (k6 exits 99).
- **Measured (2026-11-14), where the access-check time goes** (local, docker Postgres, `wrangler dev`, temporary per-phase timing, 10 VUs / 1 VU, ms p50/p95): identity Layer 1/1 · 1/2; **new Postgres connection 31/52 · 8/12**; one round trip (`select 1`) 5/13 · 1/2; `resolve` (token hash + query) 13/27 · 6/8; total 52/80 · 17/23. `EXPLAIN ANALYZE`: execution 0.3–0.9 ms on index lookups; planning 2–4 ms on a fresh connection vs ~0.15 ms on a warm one (cold catalog caches). Locally Hyperdrive connects straight to Postgres with no pool, so every request pays a cold connection; in production Hyperdrive keeps warm connections to Neon.
- **Done (2026-11-14):** (1) one `pg.Pool` per request, shared by the access check and the app Layer (`requestDatabase`); before, a request that queried after authenticating connected twice. (2) The connection is timed apart: `authenticate` connects first when there is a token and logs/answers `dbConnectMs` / `dbConnect` within `accessCheckMs` / `accessCheck`; k6 reports `db_connect` and `access_check_query` (= `access_check − db_connect`) without thresholds. Result, 10 VUs: `access_check` p95 62 ms (was 79), `db_connect` 43 ms, **`access_check_query` 23 ms (≤ 25)**; whole `GET /identity/me` p95 105 ms (was 159); ~2.3× the requests in the 30 s run.
- **Decision needed (Tech Lead):** apply the 25 ms target to the check without the connection (`access_check_query` in k6, `accessCheckMs − dbConnectMs` in Workers Logs) — a request needs its connection whether or not it is checked, so the check doesn't *add* it (PRD §6 wording) — and give `db_connect` its own budget or keep it reported only. If agreed: move the k6 threshold to `access_check_query`, update sad §7/§10 and drop `continue-on-error`. Production `accessCheckMs` / `dbConnectMs` after the first deploy stay the source of truth.
- **Sign-in leg: pending.** No scenario or threshold yet.
- **Open, needs a Security Lead decision:** sad §10 replaces Google with a test double for the sign-in leg. It must be impossible to select in production (e.g. a separate wrangler env used only by this job). Agree on the mechanism before starting; until then, run the access-check and admin thresholds and mark sign-in as pending.
