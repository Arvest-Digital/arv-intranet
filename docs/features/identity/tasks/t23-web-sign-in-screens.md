---
id: T23
title: "Build the sign-in, sign-in-return, sign-out, not-set-up and refused screens"
layer: "ui"
deps: ["T17", "T22"]
acs: ["AC-01", "AC-02", "AC-03", "AC-15", "AC-20"]
files_hint: ["apps/web/app/features/identity/routes/sign-in.tsx", "apps/web/app/features/identity/routes/sign-in-return.tsx", "apps/web/app/features/identity/routes/sign-out.tsx", "apps/web/app/features/identity/routes/not-set-up.tsx", "apps/web/app/routes.ts"]
owner: "TBD (frontend lead)"
estimate: "L"
status: "todo"
---

# T23 — Build the sign-in, sign-in-return, sign-out, not-set-up and refused screens

> Layer `ui` · estimate L · blocked by T17, T22 · ACs: AC-01, AC-02, AC-03, AC-15, AC-20 ([PRD §5](../PRD.md))

## Why

[sad §6](../sad.md) Critical flow 1 and Flow 11; [ADR-0002](../adr/0002-gate-every-web-page-at-the-root-with-a-server-only-session-cookie.md); [ADR-0007](../adr/0007-split-sign-in-into-a-web-browser-leg-and-an-identity-server-leg.md).

## What

- Sign-in: begin → keep state, verifier and returnTo in the state cookie → redirect to Google.
- Return: check `state` → complete → set the session cookie → redirect to the safe `returnTo` or home. Log `signInCompleteMs`.
- Not-set-up screen lists admins' names and emails, or «ask your manager» (AC-03). The refused screen says «only verified company Google accounts can sign in» (AC-02).
- Sign-out is a POST action: call api sign-out, clear the cookie, show the sign-in page (Google session untouched).
- Reuse `Button` and the theme tokens from `app/shared/ui` and `app.css`. No new primitives.

Files: `apps/web/app/features/identity/routes/sign-in.tsx`, `apps/web/app/features/identity/routes/sign-in-return.tsx`, `apps/web/app/features/identity/routes/sign-out.tsx`, `apps/web/app/features/identity/routes/not-set-up.tsx`, `apps/web/app/routes.ts`

## Definition of Done

- [ ] Route tests with `app/test/fake-api.ts`: state mismatch refuses; each completion outcome renders its screen; a successful return sets the cookie and redirects to the given path (AC-01).
- [ ] Route test: sign-out clears the cookie and calls the api (AC-20).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- These routes are outside the root gate (T24).
