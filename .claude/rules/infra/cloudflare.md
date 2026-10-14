---
paths:
  - "**/wrangler.jsonc"
  - "**/worker-configuration.d.ts"
  - "apps/api/src/env.ts"
---
# Cloudflare

- After editing any `wrangler.jsonc`, run `pnpm --filter @arv/{api,web} cf-typegen`.
- `apps/api/src/env.ts` declares `HYPERDRIVE` by hand — keep it in sync with `apps/api/wrangler.jsonc`.
