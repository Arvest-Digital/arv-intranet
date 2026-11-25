---
id: T28
title: "Decide the drag-and-drop support for the gesture island and record it as an ADR"
layer: "docs"
deps: []
acs: []
files_hint: ["docs/features/schedule-daily-view/adr/"]
owner: "TBD lead"
estimate: "S"
stage: "S2"
status: "todo"
---

# T28 — Decide the drag-and-drop support for the gesture island and record it as an ADR

> Stage 2 — gestures (gated by the recount) · layer `docs` · estimate S · blocked by — · ACs — (NFR / enabling work)

## Why

[PRD §8](../PRD.md#8-open-questions) DnD question (owner Tech Lead, before stage 2); [SAD §2](../sad.md#2-constraints) no new package without approval; [§11](../sad.md#11-risks-and-technical-debt).

## What

Run `/sdlc:decide-adr schedule-daily-view <title>`. The library only produces positions and steps; previews and rules come from the outcome table ([ADR-0004](../adr/0004-precompute-gesture-outcomes-once-per-gesture-on-the-server.md)).

Files: `docs/features/schedule-daily-view/adr/`

## Definition of Done

- [ ] An Accepted ADR names the chosen approach (a package with a version that passes pnpm's minimum release age, or native pointer events), its approval, and its alternatives.
- [ ] ADR Accepted and indexed in sad.md §9
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

**Stage 2 is gated:** start only if the recount 2 weeks after the first production launch funds it (PRD §7, SAD §11 KPI timing).
