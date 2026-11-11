---
id: T21
title: "Add the QG-1 revocation, session-lifetime and fail-closed integration suites"
layer: "tests"
deps: ["T18", "T19", "T20"]
acs: ["AC-07", "AC-11", "AC-17", "AC-18", "AC-20"]
files_hint: ["apps/api/test/integration/identity/revocation.test.ts", "apps/api/test/integration/identity/sessions.test.ts", "apps/api/test/integration/identity/fail-closed.test.ts"]
owner: "TBD (backend lead)"
estimate: "L"
status: "done"
---

# T21 — Add the QG-1 revocation, session-lifetime and fail-closed integration suites

> Layer `tests` · estimate L · blocked by T18, T19, T20 · ACs: AC-07, AC-11, AC-17, AC-18, AC-20 ([PRD §5](../PRD.md))

## Why

PRD §6 Revocation, Session lifetime and Fail closed are verified in CI ([sad §10](../sad.md) QG-1 scenarios 1a–1c, which name these files).

## What

- `revocation.test.ts`: two signed-in users; for each change type (remove user, take role, remove key from role, delete role) the affected user's next request is refused (401 or 403) and the other user is still served.
- `sessions.test.ts`: back-dated expiry refused; replayed signed-out token refused while the user's second session works; removal refuses every session.
- `fail-closed.test.ts`: every authenticated route with a failing DB Layer, and once with an unreachable connection string → no 2xx.

Files: `apps/api/test/integration/identity/revocation.test.ts`, `apps/api/test/integration/identity/sessions.test.ts`, `apps/api/test/integration/identity/fail-closed.test.ts`

## Definition of Done

- [x] All three suites green in `pnpm test:integration`, and each fails if a cache is introduced (sad §11).
- [x] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` clean

## Notes

- AC-17 uses a test-declared `scheduling:edit-allocations` stand-in. The real scheduling routes aren't needed.
