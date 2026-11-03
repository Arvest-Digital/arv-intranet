---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-11-03"
feature_size: M
stage: "04-05"
ticket: "TBD"
---

<!-- Format: MADR. Spawned by sdlc:architecture-design (§4 strategic decision, blast-radius 3/3). Resolves PRD §8 Q3 and the «authentication source» open question in repo ADR 0001. -->

# 0003 — Sign in with Google OpenID Connect and keep server-side sessions in identity

- **Status:** Accepted
- **Date:** 2026-11-03
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

Repo ADR 0001 left the authentication source open (Cloudflare Access JWT, SSO, or own sessions); PRD §8 Q3 asks to record it here. The PRD settles the identity source — company-managed Google accounts with a verified email on the single company domain (AC-02) — but not the session mechanism. Sessions last at most 7 days (US-09); sign-out must end that session even if the cookie was copied while other devices stay signed in (AC-20); removal from the access list must end every session of the user (AC-07).

## Decision drivers

- AC-02 (company-managed, verified, company-domain accounts only), AC-07, AC-20; PRD §6 Session lifetime (≤ 7 days absolute; 0 requests accepted after sign-out or removal).
- QG-1 — revocation on the next request; QG-2 — ≤ 25 ms p95 for the whole per-request access check.
- PRD §6.1 — refused attempts record nothing; no passwords.

## Considered options

1. **Google OIDC + server-side sessions** — authorization-code flow with PKCE against Google; the ID token's issuer, audience, expiry, `email_verified`, `hd` (hosted domain = company domain) and email domain are checked; identity stores a session row holding the SHA-256 hash of a random 256-bit token, the user and an absolute expiry of sign-in + 7 days; the cookie carries the token.
2. **Cloudflare Access in front of the web Worker** — Access (with Google Workspace as identity provider) runs the sign-in and issues a JWT the api validates per request, mapping its email to the access list.
3. **Google OIDC + our own stateless signed-JWT cookie** — the same sign-in, but the session is a signed token with a revocation list for sign-out and removal.

## Decision outcome

**Chosen:** Option 1. Server-side sessions make AC-07 and AC-20 plain row deletions or revocations, and the session lookup joins the same query that already has to read the access list and permissions on every request, so it costs no extra round-trip. Option 2's tokens stay valid after sign-out until they expire, and ending all sessions needs a call to Cloudflare's API — we would still need our own revocation list. Option 3 saves nothing, because every request reads the database anyway (PRD: access list and permissions re-checked each request), and adds a signing key to rotate plus a revocation list that is a sessions table in reverse.

## Consequences

**Positive**
- Sign-out and removal take effect on the next request by construction; a copied cookie is useless after sign-out.
- A database leak exposes no live sessions (only token hashes).
- Local development and e2e tests can create sessions directly, with no Cloudflare dependency.

**Negative**
- We own the sign-in code and the Google OAuth client secret (a Worker secret in the api); the claim checks are security-critical and need tests per claim and a security review. One maintained OIDC/JWT library is allowed for this (SAD §2).
- Sign-in depends on Google's availability; existing sessions keep working during a Google outage (up to their 7-day expiry).

**Neutral**
- Expired session rows accumulate slowly (~30 users); they are purged lazily, e.g. when the same user signs in again — no scheduled job is needed.
- A future second identity source (contractors, PRD §3 non-goal) would add a provider, not change the session model.

## Links

- PRD: [[../PRD.md]] AC-01, AC-02, AC-07, AC-20, §6, §6.1, §8 Q3
- SAD: [[../sad.md]] §2, §4, §6, §8
- Repo ADR: [[../../../adr/0001-modular-monolith]] (open question «Authentication source» — resolved here)
- Related ADR: [[0002-gate-every-web-page-at-the-root-with-a-server-only-session-cookie]], [[0005-check-permissions-with-one-kernel-require-permission-over-a-per-request-actor]]
