---
id: T27
title: "Implement CapacityImpactCheck and ProjectClosingHook in scheduling"
layer: "app"
deps: ["T11", "T16", "T23"]
acs: ["AC-19c", "AC-25", "AC-27", "AC-16"]
files_hint: ["modules/scheduling/src/application/capacity-impact-check.ts", "modules/scheduling/src/application/project-closing-hook.ts", "modules/scheduling/src/layer.ts"]
owner: "TBD (backend lead)"
estimate: "M"
status: "todo"
---

# T27 — Implement CapacityImpactCheck and ProjectClosingHook in scheduling

> Layer `app` · estimate M · blocked by [T11](./t11-org-teams-holidays-app.md), [T16](./t16-projects-app.md), [T23](./t23-scheduling-allocation-commands.md) · ACs: AC-19c, AC-25, AC-27, AC-16

## Why

The called modules ask scheduling through host-wired ports ([ADR-0007](../adr/0007-invert-capacity-and-close-checks-through-host-wired-ports.md); critical flow 2, flows 9 and 12 of [sad §6](../sad.md)).

## What

- `CapacityImpactCheck`: given changed terms or a new holiday, list resource-weeks that would become overbooked (no writes, no history).
- `ProjectClosingHook.preview/apply`: allocations ending at the close date and those removed; apply trims/removes and writes history attributed to the closer inside the caller's UoW.

Files: `modules/scheduling/src/application/capacity-impact-check.ts`, `modules/scheduling/src/application/project-closing-hook.ts`, `modules/scheduling/src/layer.ts`

## Definition of Done

- [ ] Use-case tests: AC-19c lists the overbooked weeks and writes no history; AC-27 Monday holiday affects only the full-timer; AC-25 preview lists 3 trims + later removals, apply writes `trimmed` / `removed` history by the closer (AC-16).
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

- —
