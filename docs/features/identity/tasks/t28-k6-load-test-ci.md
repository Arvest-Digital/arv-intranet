---
id: T28
title: "Add the seeded k6 load test and its CI job for the three latency targets"
layer: "tests"
deps: ["T20", "T23"]
acs: ["AC-01", "AC-17"]
files_hint: ["e2e/load/identity.k6.js", "e2e/load/seed.ts", ".github/workflows/ci.yml", "apps/api/wrangler.jsonc"]
owner: "TBD (backend lead)"
estimate: "L"
status: "todo"
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

- **Open, needs a Security Lead decision:** sad §10 replaces Google with a test double for the sign-in leg. It must be impossible to select in production (e.g. a separate wrangler env used only by this job). Agree on the mechanism before starting; until then, run the access-check and admin thresholds and mark sign-in as pending.
