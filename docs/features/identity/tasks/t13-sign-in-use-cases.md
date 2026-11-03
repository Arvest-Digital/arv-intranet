---
id: T13
title: "Implement begin and complete sign-in, with the first-admin bootstrap and the not-set-up answer"
layer: "app"
deps: ["T09", "T10", "T11"]
acs: ["AC-01", "AC-02", "AC-03", "AC-15"]
files_hint: ["modules/identity/src/application/begin-sign-in.ts", "modules/identity/src/application/complete-sign-in.ts", "modules/identity/src/application/sign-in.test.ts"]
owner: "TBD (backend lead)"
estimate: "L"
status: "todo"
---

# T13 — Implement begin and complete sign-in, with the first-admin bootstrap and the not-set-up answer

> Layer `app` · estimate L · blocked by T09, T10, T11 · ACs: AC-01, AC-02, AC-03, AC-15 ([PRD §5](../PRD.md))

## Why

Identity owns the server leg of sign-in ([ADR-0007](../adr/0007-split-sign-in-into-a-web-browser-leg-and-an-identity-server-leg.md); [ADR-0003](../adr/0003-sign-in-with-google-oidc-and-server-side-sessions.md); [sad §6](../sad.md) Critical flow 1; [sad §5](../sad.md) first-admin bootstrap).

## What

- `beginSignIn()` → `{ authorizationUrl, state, codeVerifier }` (the verifier goes back to web, which keeps it in its cookie).
- `completeSignIn(code, verifier)`: exchange (outside any transaction) → eligibility → `Refused` (nothing stored or logged) | not on the list → `NotSetUp { admins }` (empty means «ask your manager») | eligible.
- First admin (AC-15), inside one `UnitOfWork`: while no admin exists and the email equals `FIRST_ADMIN_EMAIL`, upsert the user under Google's name and `ensureAdminRole` + assign.
- Lazy purge of expired sessions, create the session, log `identity.sign_in.succeeded { userId }` only.

Files: `modules/identity/src/application/begin-sign-in.ts`, `modules/identity/src/application/complete-sign-in.ts`, `modules/identity/src/application/sign-in.test.ts`

## Definition of Done

- [ ] Unit tests (fakes): a listed user gets a session expiring in 7 days (AC-01); each refused claim stores and logs nothing (AC-02); an unlisted person gets `NotSetUp` with the admins' names and emails, or an empty list (AC-03).
- [ ] Unit tests (AC-15): the configured address becomes admin only while no admin exists, keeps existing roles, and reuses an existing «Admin» role. Once an admin exists, the address gets nothing extra.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- Google is never called inside a transaction ([sad §8](../sad.md) Transactions).
