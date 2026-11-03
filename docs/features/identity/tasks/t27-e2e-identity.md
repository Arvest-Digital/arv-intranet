---
id: T27
title: "Add the identity end-to-end tests over seeded sessions"
layer: "tests"
deps: ["T23", "T25", "T26"]
acs: ["AC-01", "AC-03", "AC-04", "AC-07", "AC-09", "AC-12", "AC-20"]
files_hint: ["e2e/tests/identity/", "e2e/db.ts", "e2e/global-setup.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T27 — Add the identity end-to-end tests over seeded sessions

> Layer `tests` · estimate M · blocked by T23, T25, T26 · ACs: AC-01, AC-03, AC-04, AC-07, AC-09, AC-12, AC-20 ([PRD §5](../PRD.md))

## Why

The main journeys through the real web and api Workers ([sad §10](../sad.md); PRD §5).

## What

- Sessions are seeded in the DB and set as the cookie. Google isn't driven in e2e; the sign-in completion leg is covered by T17's integration tests.
- Journeys: anonymous `/board` → sign-in with `returnTo`; the admin adds a user with the pre-selected role, creates «Planner» and assigns it; the removed user's next navigation shows «no longer have access»; sign-out → sign-in page; a non-admin sees no «Access».

Files: `e2e/tests/identity/`, `e2e/db.ts`, `e2e/global-setup.ts`

## Definition of Done

- [ ] `pnpm test:e2e` green locally and in CI.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
