---
id: T32
title: "Add keyboard move and stretch to the gesture island (arrow keys, confirm, Escape to cancel)"
layer: "ui"
deps: ["T31"]
acs: ["AC-20"]
files_hint: ["apps/web/app/features/scheduling/components/gesture-island.tsx", "apps/web/app/features/scheduling/components/gesture-keyboard.test.tsx"]
owner: "TBD lead"
estimate: "M"
stage: "S2"
status: "todo"
---

# T32 — Add keyboard move and stretch to the gesture island (arrow keys, confirm, Escape to cancel)

> Stage 2 — gestures (gated by the recount) · layer `ui` · estimate M · blocked by T31 · ACs AC-20

## Why

[AC-20](../PRD.md#5-acceptance-criteria); [§8 Accessibility](../sad.md#8-crosscutting-concepts).

## What

Keyboard mode in the same island; announcements via an aria-live region.

Files: `apps/web/app/features/scheduling/components/gesture-island.tsx`, `apps/web/app/features/scheduling/components/gesture-keyboard.test.tsx`

## Definition of Done

- [ ] Component tests show focus on a bar, choosing move/start/end, arrow keys stepping by working days with the same preview, Enter saving with the same rules and warnings, and Escape cancelling with nothing changed (AC-20).
- [ ] Component tests pass
- [ ] `pnpm lint && pnpm typecheck && pnpm test` clean

## Notes

Shares `gesture-island.tsx` with T31 → serialized.
