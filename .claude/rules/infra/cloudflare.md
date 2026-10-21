---
paths:
  - "**/wrangler.jsonc"
  - "**/worker-configuration.d.ts"
  - "apps/api/src/env.ts"
---
# Cloudflare

- After editing any `wrangler.jsonc`, run `pnpm --filter @arv/{api,web} cf-typegen`.
- `apps/api/src/env.ts` declares bindings by hand (`HYPERDRIVE`, later the events Queue). Keep it in sync with `apps/api/wrangler.jsonc`.
- The main Hyperdrive config has query caching off (`--caching-disabled`, read-your-writes). Use a separate cached config only for data that may be stale.
- Assume the Workers Paid plan limits; keep at most ~5 parallel DB connections per request.
