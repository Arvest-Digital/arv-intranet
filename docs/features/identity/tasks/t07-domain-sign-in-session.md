---
id: T07
title: "Model sign-in eligibility, sessions, the first-admin rule and the last-admin rule"
layer: "domain"
deps: ["T01"]
acs: ["AC-02", "AC-14", "AC-15", "AC-20"]
files_hint: ["modules/identity/src/domain/sign-in-eligibility.ts", "modules/identity/src/domain/session.ts", "modules/identity/src/domain/last-admin.ts", "modules/identity/src/domain/sign-in-eligibility.test.ts", "modules/identity/src/domain/session.test.ts", "modules/identity/src/domain/last-admin.test.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T07 — Model sign-in eligibility, sessions, the first-admin rule and the last-admin rule

> Layer `domain` · estimate M · blocked by T01 · ACs: AC-02, AC-14, AC-15, AC-20 ([PRD §5](../PRD.md))

## Why

Claim checks, the 7-day absolute session and the admin rules are pure decisions ([ADR-0003](../adr/0003-sign-in-with-google-oidc-and-server-side-sessions.md); [sad §5](../sad.md) tactical decisions; [sad §6](../sad.md) Critical flows 1–3).

## What

- `signInEligibility(claims, companyDomain)` → `Eligible { email, name }` | `Refused`: `email_verified === true`, `hd` equals the domain, email on the domain. A missing claim refuses (fail closed). Issuer, audience, expiry and signature are checked by the adapter (T11).
- `session.ts`: 256-bit token from Web Crypto (base64url), SHA-256 hex hash, `expiresAt = signedInAt + 7 days`, validity → `active | expired | revoked(access-removed) | unknown`.
- `isFirstAdmin(email, configuredFirstAdmin, adminExists)` (AC-15). `assertAdminRemains(holderCount)` → `LastAdminRequired` when 0 (AC-14).

Files: `modules/identity/src/domain/sign-in-eligibility.ts`, `modules/identity/src/domain/session.ts`, `modules/identity/src/domain/last-admin.ts`, `modules/identity/src/domain/sign-in-eligibility.test.ts`, `modules/identity/src/domain/session.test.ts`, `modules/identity/src/domain/last-admin.test.ts`

## Definition of Done

- [ ] Unit tests, one per refused claim (AC-02): unverified, missing `hd`, other `hd`, other email domain, missing email.
- [ ] Unit tests: expiry exactly at 7 days is refused; a revoked session reports `access-removed` (AC-07, AC-20); token hash is deterministic and the token is 32 random bytes.
- [ ] Unit tests: the first-admin rule applies only while no admin exists (AC-15); the last-admin rule refuses at 0 and allows at ≥1 (AC-14).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- No logging of email, name or claims anywhere ([sad §8](../sad.md) Logging).
