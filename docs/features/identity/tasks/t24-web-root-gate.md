---
id: T24
title: "Gate every page at the root and show navigation by permission"
layer: "ui"
deps: ["T17", "T20", "T22"]
acs: ["AC-01", "AC-03", "AC-07", "AC-08", "AC-20"]
files_hint: ["apps/web/app/root.tsx", "apps/web/app/routes/home.tsx", "apps/web/app/features/identity/components/app-nav.tsx"]
owner: "TBD (frontend lead)"
estimate: "M"
status: "todo"
---

# T24 — Gate every page at the root and show navigation by permission

> Layer `ui` · estimate M · blocked by T17, T20, T22 · ACs: AC-01, AC-03, AC-07, AC-08, AC-20 ([PRD §5](../PRD.md))

## Why

No page shell renders anonymously ([ADR-0002](../adr/0002-gate-every-web-page-at-the-root-with-a-server-only-session-cookie.md); [sad §4](../sad.md) choice 1; [sad §6](../sad.md) Critical flow 2).

## What

- Root loader: public routes bypass the gate. No cookie → redirect to sign-in with `returnTo`. Otherwise call `me`: 401 → redirect; 401 `access-removed` → clear the cookie and show «you no longer have access» (AC-07); 5xx → error page with no data.
- Navigation shows «Access» only with `identity:manage-access`. A 403 from an admin loader shows «you lack the permission to manage access» (AC-08). The sign-out button sits in the nav.
- Reuse `DropdownMenu` and `Button`.

Files: `apps/web/app/root.tsx`, `apps/web/app/routes/home.tsx`, `apps/web/app/features/identity/components/app-nav.tsx`

## Definition of Done

- [ ] Route tests: anonymous visit to `/board` redirects to sign-in with `returnTo=/board`; access-removed clears the cookie and shows the message; a non-admin sees no «Access» link.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- The api still refuses on its own. This gate is for UX and to keep page shells from rendering (ADR-0002).
