---
status: Accepted
owner: "dmitro.b"
reviewers: ["Tech Lead", "Security Lead"]
updated_at: "2026-11-03"
feature_size: M
stage: "04-05"
ticket: "TBD"
---

<!-- Format: MADR. Spawned by sdlc:architecture-design (§4 UI-architecture decision, blast-radius 2/3: multi-module + legitimate alternative). -->

# 0002 — Gate every web page at the root with a server-only session cookie

- **Status:** Accepted
- **Date:** 2026-11-03
- **Deciders:** dmitro.b (Architect), with Claude during the architecture-design Socratic pass

## Context

The web Worker is server-rendered with React Router 7 (repo convention; a client-side SPA is not on the table). Once sign-in exists, every page must refuse a visitor without a valid session and send them to sign-in, then back to the page they first asked for (AC-01), and must not render any intranet page or data without a session (AC-03, AC-20). This is a contract every later web feature (scheduling, people, leave) inherits, so where the gate lives matters beyond identity.

## Decision drivers

- AC-01 (return to the first page), AC-03 and AC-20 (no intranet page without a session).
- QG-1 (SAD §1) — fail closed; the api remains the real enforcement point.
- PRD §7 — shared-check adoption: a new feature should be protected without remembering to be.

## Considered options

1. **One gate on the root route** — a React Router middleware (or the root loader) reads the HttpOnly session cookie, asks the api once per navigation who the user is and what they may do, and redirects to sign-in with a same-origin `returnTo` when there is no valid session; only the sign-in, sign-in-return, sign-out and «not set up yet» routes sit outside it.
2. **Each feature handles 401 itself** — no central gate; each feature loader calls the api and a shared helper redirects on 401.

## Decision outcome

**Chosen:** Option 1. A root gate protects every current and future page by construction, including pages that load no api data, and gives navigation the user's permissions; option 2 would render page shells to anonymous visitors (breaking AC-03) and relies on every feature remembering the helper.

## Consequences

**Positive**
- New web features are behind sign-in automatically; navigation can show admin-only links from the same answer.
- The cookie is HttpOnly, Secure, `SameSite=Lax`, read and written only by the web server — browser JavaScript never sees the session token.

**Negative**
- Two access checks per page view (the gate's and the feature loader's api call); they run in parallel and each is bounded by QG-2 (≤ 25 ms p95).
- `returnTo` must be validated as a same-origin relative path, or the sign-in becomes an open redirect (AC-01: «a page outside the intranet was named» → home).

**Neutral**
- Screens reuse the existing shadcn components in `apps/web/app/shared/ui` and the theme tokens; no new styling system.

## Links

- PRD: [[../PRD.md]] AC-01, AC-03, AC-20
- SAD: [[../sad.md]] §4, §5, §8
- Related ADR: [[0001-build-backend-service-and-web-frontend-surfaces]], [[0003-sign-in-with-google-oidc-and-server-side-sessions]]
