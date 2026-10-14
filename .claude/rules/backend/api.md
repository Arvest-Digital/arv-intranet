---
paths:
  - "apps/api/**"
---
# API

- Layering: routes (`src/http/routes`) → `runEffect` → services → repositories.
- New service: register in both `AppServices` and `makeAppLayer` (`apps/api/src/layers.ts`).
- Unit tests mock repositories via `Layer.succeed`.
