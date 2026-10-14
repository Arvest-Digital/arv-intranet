---
paths:
  - "packages/db/**"
  - "apps/api/src/repositories/**"
---
# Database

- New table: also add it to `resetDatabase` (`packages/db/src/testing/reset.ts`).
- Drizzle uses `casing: 'snake_case'` (camelCase in TS); IDs use `uuidv7()` (requires Postgres 18).
- Never edit an applied migration; generate a new one (`pnpm db:generate`). `pnpm db:status` flags edits as "Changed".
- Don't close DB connections explicitly (Hyperdrive guidance; causes "socket has been closed").
