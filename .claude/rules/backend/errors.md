---
paths:
  - "packages/contracts/src/errors.ts"
  - "apps/api/src/http/errors.ts"
---
# Errors

New error:

1. Add it to `packages/contracts/src/errors.ts`.
2. Add it to the `AppError` union (`apps/api/src/http/errors.ts`).
3. Handle it in `toHttpError` (same file, exhaustive switch).
