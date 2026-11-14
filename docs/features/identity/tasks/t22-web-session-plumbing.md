---
id: T22
title: "Add the web session and sign-in-state cookies, Bearer forwarding, the returnTo check and the Origin check"
layer: "ui"
deps: ["T16"]
acs: ["AC-01", "AC-20"]
files_hint: ["apps/web/app/shared/lib/session.server.ts", "apps/web/app/shared/lib/return-to.ts", "apps/web/app/shared/lib/origin-check.server.ts", "apps/web/app/shared/lib/api.server.ts", "apps/web/app/features/identity/identity.server.ts"]
owner: "TBD (frontend lead)"
estimate: "M"
status: "done"
---

# T22 — Add the web session and sign-in-state cookies, Bearer forwarding, the returnTo check and the Origin check

> Layer `ui` · estimate M · blocked by T16 · ACs: AC-01, AC-20 ([PRD §5](../PRD.md))

## Why

Web owns the browser leg and the server-only cookie ([ADR-0002](../adr/0002-gate-every-web-page-at-the-root-with-a-server-only-session-cookie.md); [ADR-0007](../adr/0007-split-sign-in-into-a-web-browser-leg-and-an-identity-server-leg.md); [sad §8](../sad.md) Authentication, CSRF, Open redirect).

## What

- `__Host-arv_session`: HttpOnly, Secure, `SameSite=Lax`, `Path=/`, lifetime ≤ the session's expiry. Sign-in-state cookie: 10 minutes, holding `state`, the PKCE verifier and `returnTo`.
- `bindingFetch` forwards the session token as `Authorization: Bearer`.
- `safeReturnTo` accepts only same-origin paths starting with `/` and not `//` (AC-01). Non-GET requests whose `Origin` isn't web's own are rejected.
- Extend the typed identity client for the new endpoints.

Files: `apps/web/app/shared/lib/session.server.ts`, `apps/web/app/shared/lib/return-to.ts`, `apps/web/app/shared/lib/origin-check.server.ts`, `apps/web/app/shared/lib/api.server.ts`, `apps/web/app/features/identity/identity.server.ts`

## Definition of Done

- [x] Unit tests: cookie attributes; `safeReturnTo` for `/board`, `//evil`, `https://evil`, `javascript:` and empty; Origin check rejects a foreign origin on POST.
- [x] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- Web imports only `@arv/contracts/*` and `import type` from `@arv/api`.
