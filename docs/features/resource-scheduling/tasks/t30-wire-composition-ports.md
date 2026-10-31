---
id: T30
title: "Wire scheduling's port implementations in the composition root"
layer: "wiring"
deps: ["T13", "T17", "T27", "T29"]
acs: ["AC-19c", "AC-25", "AC-27", "AC-14"]
files_hint: ["apps/api/src/composition.ts", "apps/api/test/integration/composition/", "ARCHITECTURE.md"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T30 — Wire scheduling's port implementations in the composition root

> Layer `wiring` · estimate M · blocked by [T13](./t13-org-http-teams-holidays.md), [T17](./t17-projects-http.md), [T27](./t27-scheduling-port-implementations.md), [T29](./t29-scheduling-http-writes.md) · ACs: AC-19c, AC-25, AC-27, AC-14

## Why

Risk «host-wired ports left on their no-op default» ([sad §11](../sad.md)); [ADR-0007](../adr/0007-invert-capacity-and-close-checks-through-host-wired-ports.md).

## What

- `composition.ts` provides scheduling's `CapacityImpactCheck` and `ProjectClosingHook` Layers to org and projects.
- `ARCHITECTURE.md`: document the cross-module port pattern.

Files: `apps/api/src/composition.ts`, `apps/api/test/integration/composition/`, `ARCHITECTURE.md`

## Definition of Done

- [ ] Api integration tests through the real composition root: contract-hours change that overbooks → 409 `ConfirmationRequired` (AC-19c); holiday add that overbooks → 409 (AC-27); confirmed project close trims allocations and writes history (AC-25).
- [ ] Integration test: changing the stub grants between two requests changes the outcome (AC-14).
- [ ] `pnpm check:modules` still passes (no new module edge).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean (+ `pnpm test:integration`)

## Notes

- —
