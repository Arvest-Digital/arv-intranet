---
id: T29
title: "Update ARCHITECTURE.md and repo ADR 0001, and add the deploy checklist and the first-admin recovery runbook"
layer: "docs"
deps: ["T20"]
acs: ["AC-02", "AC-15"]
files_hint: ["ARCHITECTURE.md", "docs/adr/0001-modular-monolith.md", "CONTEXT.md", "apps/web/wrangler.jsonc", "docs/runbooks/identity.md"]
owner: "dmitro.b"
estimate: "M"
status: "review"
---

# T29 — Update ARCHITECTURE.md and repo ADR 0001, and add the deploy checklist and the first-admin recovery runbook

> Layer `docs` · estimate M · blocked by T20 · ACs: AC-02, AC-15 ([PRD §5](../PRD.md))

## Why

Repo docs describe the pre-identity state ([sad §11](../sad.md) last row; [sad §7](../sad.md) deployment; PRD §8 Q2 and Q4).

## What

- `ARCHITECTURE.md`: identity in the module catalog; «Authentication source» resolved by ADR-0003; the `permissions.ts` convention; identity queries use only the uncached Hyperdrive config.
- Repo ADR 0001: mark the open question resolved. `CONTEXT.md`: fix «roles/permissions feature».
- Runbook: deploy order (migrate → api → web), secrets and vars, the Google OAuth client with an **Internal** consent screen (AC-02), the custom-domain route for `arv-web` and the sign-in Rate Limiting rule, and first-admin recovery via `FIRST_ADMIN_EMAIL` (AC-15, PRD §8 Q4).

Files: `ARCHITECTURE.md`, `docs/adr/0001-modular-monolith.md`, `CONTEXT.md`, `apps/web/wrangler.jsonc`, `docs/runbooks/identity.md`

## Definition of Done

- [ ] `pnpm lint` (module graph unchanged: `identity → (none)`) clean.
- [ ] The runbook is reviewed by the Tech Lead.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- Custom domain and zone name are external inputs; leave the `routes` entry as a TODO with the owner named if the zone isn't decided. Shares `ARCHITECTURE.md` with T03, so they run in one lane.
