---
id: T16
title: "Add the identity contract schemas for sign-in, me, the access list, access roles and permissions"
layer: "ports"
deps: []
acs: ["AC-01", "AC-03", "AC-04", "AC-09", "AC-12", "AC-13", "AC-16"]
files_hint: ["packages/contracts/src/identity/"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T16 — Add the identity contract schemas for sign-in, me, the access list, access roles and permissions

> Layer `ports` · estimate M · blocked by — · ACs: AC-01, AC-03, AC-04, AC-09, AC-12, AC-13, AC-16 ([PRD §5](../PRD.md))

## Why

Web and api share Effect Schemas derived from [openapi.yaml](../contracts/openapi.yaml) ([sad §5](../sad.md) contracts).

## What

- Schemas for every request and response body in openapi.yaml: begin/complete sign-in (signed in, not set up with admins, refused), `Me` (id, name, email, permissions), user with roles and combined permissions, add/rename/set-roles inputs, access role with permissions (`retired` flag), holder count and pre-selected flag, create/update/pre-select inputs, permission declaration.
- Error `code` literals from the contract (`identity.*`).

Files: `packages/contracts/src/identity/`

## Definition of Done

- [ ] Unit tests: each schema decodes its openapi.yaml example and rejects one malformed variant.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- No dependency on any other task, so it can start on day one alongside T01, T03 and T04.
