---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-11-03"
feature_size: M
stage: "04-05"
ticket: "TBD"
---

<!-- Format: MADR. Spawned by sdlc:architecture-design (§5 building-block decision, blast-radius 2/3: multi-module + legitimate alternative). -->

# 0007 — Split sign-in into a web browser leg and an identity server leg

- **Status:** Accepted
- **Date:** 2026-11-03
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

ADR-0003 chose Google OpenID Connect with server-side sessions. Browsers only reach the public web Worker; the api is private and answers only web. The sign-in flow has a browser leg (redirect to Google, anti-forgery `state`, PKCE verifier, returning to the first page, the session cookie) and a server leg (exchanging the code with the Google client secret, checking the claims, the access list, the first-admin rule, creating the session). Where each leg runs decides where secrets live and whether a compromised web Worker could mint sessions.

## Decision drivers

- Trust boundary at the web Worker (SAD §3); the Google client secret and configuration must stay in the api.
- AC-01 (return to the first page), AC-02 (claims), AC-03 (not-set-up screen, nothing recorded), AC-15 (first admin).
- ADR-0002 — web already reads the session cookie for its root gate.

## Considered options

1. **Web owns the browser leg, identity the server leg** — web asks identity for Google's sign-in address (identity returns it with `state` and the PKCE verifier), keeps them and `returnTo` in a 10-minute HttpOnly cookie, checks `state` on return and hands the code to identity; identity exchanges it, checks claims, applies the access list and first-admin rule, creates the session and returns the token or the refusal; web sets the session cookie and forwards the token as `Authorization: Bearer` on every api call.
2. **The whole OAuth flow in the api, proxied by web** — api serves `/auth/*`, sets cookies and redirects; web passes those requests through.

## Decision outcome

**Chosen:** Option 1. Secrets and every decision about who may sign in stay in the api, and a session can only be created from a real Google code — web cannot mint one. Option 2 turns the private api into a browser-facing service (cookies, redirects, web's domain), while web would still have to read the cookie for its gate and forward it on every call.

## Consequences

**Positive**
- The api's existing `authenticate` middleware already reads `Authorization: Bearer`; only the token source changes.
- Sign-in endpoints are the only api routes reachable without a session, and only web can reach them.

**Negative**
- Two web → api calls per sign-in (begin, complete); fine against the 800 ms p95 target.
- Every web gateway must forward the bearer token — done once in `shared/lib/api.server.ts`.

**Neutral**
- The sign-in-return URL registered with Google is web's; it is configured in the api (`SIGN_IN_RETURN_URL`) because identity builds the address.

## Links

- PRD: [[../PRD.md]] AC-01, AC-02, AC-03, AC-15
- SAD: [[../sad.md]] §5, §6, §8
- Related ADR: [[0002-gate-every-web-page-at-the-root-with-a-server-only-session-cookie]], [[0003-sign-in-with-google-oidc-and-server-side-sessions]]
