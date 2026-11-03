---
id: T11
title: "Implement the GoogleSignIn adapter on a pinned OIDC library"
layer: "infra"
deps: ["T08"]
acs: ["AC-01", "AC-02"]
files_hint: ["modules/identity/src/infrastructure/google-sign-in.ts", "modules/identity/src/infrastructure/google-sign-in.test.ts", "modules/identity/package.json", "pnpm-lock.yaml"]
owner: "TBD (backend lead)"
estimate: "L"
status: "todo"
---

# T11 — Implement the GoogleSignIn adapter on a pinned OIDC library

> Layer `infra` · estimate L · blocked by T08 · ACs: AC-01, AC-02 ([PRD §5](../PRD.md))

## Why

Authorization-code flow with PKCE and ID-token checks through a maintained library, not hand-written crypto ([ADR-0003](../adr/0003-sign-in-with-google-oidc-and-server-side-sessions.md); [ADR-0007](../adr/0007-split-sign-in-into-a-web-browser-leg-and-an-identity-server-leg.md); [sad §2](../sad.md) approved exception).

## What

- **Library: `oauth4webapi`** (zero dependencies, Web Crypto, Workers-compatible). Pin a version older than pnpm's minimum release age.
- `authorizationUrl(state, codeChallenge)` with scope `openid email profile`, `hd=<company domain>` and `redirect_uri = SIGN_IN_RETURN_URL`.
- `exchangeCode(code, verifier)` → validated claims: issuer `https://accounts.google.com`, audience = client id, expiry, ID-token signature against Google's JWKS.
- Token endpoint down or timing out → defect, logged as `identity.google.unavailable` (timestamp only). A rejected code → `SignInRefused`.

Files: `modules/identity/src/infrastructure/google-sign-in.ts`, `modules/identity/src/infrastructure/google-sign-in.test.ts`, `modules/identity/package.json`, `pnpm-lock.yaml`

## Definition of Done

- [ ] Unit tests with a stubbed `fetch` and a locally signed JWT: wrong issuer, wrong audience, expired token and bad signature each → refused; a valid token → claims.
- [ ] Unit test: a token-endpoint failure logs only `identity.google.unavailable`, with no email, name or code.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- **Library decision (made here, as sad §2 asked):** `oauth4webapi`. At task start, confirm the pinned version verifies the ID-token JWS. If it doesn't, ask before adding `jose` as a second package; the approval covers one library.
- Security-sensitive: one test per claim is the mitigation in sad §11. The Security Lead reviews this PR.
