---
id: T27
title: "Write the stage 3 release runbook (ADR-0003 guard, QG-4 count check) and fold the S3 delta into the base contract and ARCHITECTURE.md"
layer: "docs"
deps: ["T16", "T17", "T20"]
acs: []
files_hint: ["docs/features/schedule-daily-view/release-stage-3.md", "docs/features/resource-scheduling/contracts/openapi.yaml", "ARCHITECTURE.md"]
owner: "TBD lead"
estimate: "S"
stage: "S3"
status: "todo"
---

# T27 — Write the stage 3 release runbook (ADR-0003 guard, QG-4 count check) and fold the S3 delta into the base contract and ARCHITECTURE.md

> Stage 3 — time of day · layer `docs` · estimate S · blocked by T16, T17, T20 · ACs — (NFR / enabling work)

## Why

[SAD §7 release sequence](../sad.md#7-deployment-view), [QG-4](../sad.md#10-quality-requirements), [§11 ADR-0003 precondition (High)](../sad.md#11-risks-and-technical-debt); [data-model release SQL](../data-model.md#stage-3-release-sql-runbook-not-a-migration); [api-sync D-4](../contracts/api-sync-report.md#section-d--deferrals).

## What

Runbook doc plus contract and architecture doc updates. No code.

Files: `docs/features/schedule-daily-view/release-stage-3.md`, `docs/features/resource-scheduling/contracts/openapi.yaml`, `ARCHITECTURE.md`

## Definition of Done

- [ ] The runbook lists SAD §7 steps 0–5 with the data-model SQL (non-test count guard that stops production, delete test allocations, migrate, deploy api then web, QG-4 counts all 0, re-seed), the base openapi shows the interval-shaped AllocationSegment and timeOverlaps, and ARCHITECTURE.md records the impact list and the new reads.
- [ ] Tech Lead reviews the runbook
- [ ] Base contract and ARCHITECTURE.md updated in the same PR
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Step 0 is a human decision; SQL cannot make it.
