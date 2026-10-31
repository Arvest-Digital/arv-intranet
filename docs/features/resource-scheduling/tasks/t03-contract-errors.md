---
id: T03
title: "Add Forbidden, ConfirmationRequired, detailed Conflict and ValidationError contract errors"
layer: "ports"
deps: []
acs: ["AC-12", "AC-10", "AC-07b", "AC-09"]
files_hint: ["packages/contracts/src/shared/errors.ts", "packages/contracts/src/shared/index.ts", "packages/platform/src/http/errors.ts", "packages/platform/src/http/run-effect.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T03 — Add Forbidden, ConfirmationRequired, detailed Conflict and ValidationError contract errors

> Layer `ports` · estimate M · blocked by — · ACs: AC-12, AC-10, AC-07b, AC-09

## Why

Warn-then-confirm, permission refusals and concurrent-edit conflicts are typed errors ([ADR-0010](../adr/0010-confirm-by-resubmitting-with-typed-confirmation-errors.md); [sad §8](../sad.md) Error handling; [api-sync-report.md](../contracts/api-sync-report.md) D-2, D-3; [openapi.yaml](../contracts/openapi.yaml) `ApiError`).

## What

- `@arv/contracts/shared`: `Forbidden` (403, names the missing permission), `ConfirmationRequired` (409, carries an impact list), `Conflict` gains optional `details` (current values, changed by/at), `ValidationError` usable by presenters for domain-rule failures (400, `code` + `details.rules`).
- `ApiErrorBody` gains `code` and optional `details` matching the OpenAPI `ApiError` schema.
- `@arv/platform/http` maps each to its status.

Files: `packages/contracts/src/shared/errors.ts`, `packages/contracts/src/shared/index.ts`, `packages/platform/src/http/errors.ts`, `packages/platform/src/http/run-effect.ts`

## Definition of Done

- [ ] Unit tests: each new error maps to its status and a body that validates against the OpenAPI `ApiError` example.
- [ ] Existing `NotFound` / `Conflict` behaviour for identity unchanged (identity tests green).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- **Gate:** D-3 (`ValidationError` as a contract error) needs Tech Lead sign-off, ideally as an amendment line in ADR-0010, before this task starts (`.claude/rules/backend/errors.md`).
