---
id: T02
title: "Add Unauthorized and Forbidden contract errors and map the kernel permission errors once in platform"
layer: "ports"
deps: ["T01"]
acs: ["AC-08", "AC-17", "AC-18", "AC-19", "AC-20"]
files_hint: ["packages/contracts/src/shared/errors.ts", "packages/contracts/src/shared/index.ts", "packages/platform/src/http/errors.ts", "packages/platform/src/http/run-effect.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T02 — Add Unauthorized and Forbidden contract errors and map the kernel permission errors once in platform

> Layer `ports` · estimate M · blocked by T01 · ACs: AC-08, AC-17, AC-18, AC-19, AC-20 ([PRD §5](../PRD.md))

## Why

Permission refusals are mapped once, not per feature ([ADR-0005](../adr/0005-check-permissions-with-one-kernel-require-permission-over-a-per-request-actor.md); [sad §8](../sad.md) Error handling; [api-sync-report.md](../contracts/api-sync-report.md) D-2; [openapi.yaml](../contracts/openapi.yaml) `ApiError`).

## What

- `@arv/contracts/shared`: `Unauthorized` (401, optional `reason: 'access-removed'`) and `Forbidden` (403, names the missing permission).
- `ApiErrorBody` gains `code` (e.g. `identity.last_admin_required`) and optional `details`, matching the OpenAPI `ApiError` schema.
- `@arv/platform/http`: `runEffect` maps kernel `PermissionDenied` → `Forbidden` 403 and `Unauthenticated` → `Unauthorized` 401, so presenters never see them.

Files: `packages/contracts/src/shared/errors.ts`, `packages/contracts/src/shared/index.ts`, `packages/platform/src/http/errors.ts`, `packages/platform/src/http/run-effect.ts`

## Definition of Done

- [ ] Unit tests: each new error maps to its status and to a body that decodes against the OpenAPI `ApiError` example.
- [ ] Unit test: an effect failing with `PermissionDenied` run through `runEffect` answers 403; with `Unauthenticated { reason: 'access-removed' }` answers 401 with that reason.
- [ ] Existing `NotFound` / `Conflict` behaviour unchanged (identity tests green).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- **Shared with resource-scheduling [T03](../../resource-scheduling/tasks/t03-contract-errors.md)** (`Forbidden`, `ApiErrorBody.code`). Whichever runs first adds them, and the other adds only its own errors. Follow `.claude/rules/backend/errors.md`.
