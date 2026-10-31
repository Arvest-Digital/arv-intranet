---
id: T17
title: "Expose project endpoints with leave-project redaction in the list"
layer: "ports"
deps: ["T03", "T16"]
acs: ["AC-23", "AC-24", "AC-25", "AC-26", "AC-29"]
files_hint: ["packages/contracts/src/projects/", "modules/projects/src/http/", "apps/api/test/integration/projects/"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T17 — Expose project endpoints with leave-project redaction in the list

> Layer `ports` · estimate M · blocked by [T03](./t03-contract-errors.md), [T16](./t16-projects-app.md) · ACs: AC-23, AC-24, AC-25, AC-26, AC-29

## Why

`/projects*` operations of [openapi.yaml](../contracts/openapi.yaml); leave-type projects not offered to viewers without see-leave-reasons ([PRD §5](../PRD.md) AC-29).

## What

- Routes `listProjects`, `createProject`, `closeProject` + contract schemas; list omits leave-type projects for viewers without `scheduling:see-leave-reasons` (except when booking leave per OpenAPI filter).

Files: `packages/contracts/src/projects/`, `modules/projects/src/http/`, `apps/api/test/integration/projects/`

## Definition of Done

- [ ] Api integration tests: duplicate open name → 409, close without confirm → 409 `ConfirmationRequired`, missing permission → 403, leave projects absent from the list for a viewer without see-leave-reasons.
- [ ] Bodies validate against the OpenAPI examples.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- Reading `scheduling:see-leave-reasons` in projects is a permission constant from the kernel, not a module import — no new edge.
