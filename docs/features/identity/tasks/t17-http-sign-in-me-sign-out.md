---
id: T17
title: "Expose sign-in begin and complete, me and sign-out routes"
layer: "ports"
deps: ["T02", "T12", "T13", "T16"]
acs: ["AC-01", "AC-02", "AC-03", "AC-15", "AC-20"]
files_hint: ["modules/identity/src/http/sign-in-routes.ts", "modules/identity/src/http/routes.ts", "modules/identity/src/http/presenter.ts", "apps/api/test/integration/identity/sign-in.test.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "done"
---

# T17 — Expose sign-in begin and complete, me and sign-out routes

> Layer `ports` · estimate M · blocked by T02, T12, T13, T16 · ACs: AC-01, AC-02, AC-03, AC-15, AC-20 ([PRD §5](../PRD.md))

## Why

HTTP contract for the server leg and the session ([openapi.yaml](../contracts/openapi.yaml) `beginSignIn`, `completeSignIn`, `getMe`, `signOut`; [ADR-0007](../adr/0007-split-sign-in-into-a-web-browser-leg-and-an-identity-server-leg.md)).

## What

- Routes per openapi.yaml. Presenter maps domain errors → contract errors with `code`.
- `/identity/me` returns id, name, email and the actor's permission keys (web uses them for navigation).
- `sign-out` returns 204.

Files: `modules/identity/src/http/sign-in-routes.ts`, `modules/identity/src/http/routes.ts`, `modules/identity/src/http/presenter.ts`, `apps/api/test/integration/identity/sign-in.test.ts`

## Definition of Done

- [ ] Integration tests (Google replaced by a fake `GoogleSignIn` Layer): a listed user gets a token (AC-01); a refused claim answers the refused body (AC-02); an unlisted person gets not-set-up with admins (AC-03); the first-admin path (AC-15).
- [ ] Integration test: after sign-out, `me` with that token → 401 (AC-20).
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` clean

## Notes

- Shares `routes.ts` and `presenter.ts` with T18 and T19, so they run in one lane.
