---
paths:
  - "packages/contracts/**"
---
# Contracts

- Wire DTOs and shared HTTP errors, as Effect Schemas: `src/shared/` plus one folder per module (`src/<module>/`), each exported as a subpath (`@arv/contracts/<module>`). There is no root export.
- May depend only on `effect`. No domain logic, no domain types.
- Map domain ↔ DTO in the module's `http/presenter.ts`, not here.
- Breaking change to a DTO: update the web gateway/decoder in the same PR.
