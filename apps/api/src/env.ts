import type { Actor } from '@arv/kernel';
import type { HttpEnv } from '@arv/platform/http';

/**
 * Bindings are declared by hand instead of using the generated global `Env`: `apps/web` type-imports
 * this app (for the route types) and has its own global `Env`, so the two would clash.
 * Keep in sync with wrangler.jsonc.
 */
export type Bindings = {
  HYPERDRIVE: Hyperdrive;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: HttpEnv['Variables'] & {
    actor: Actor;
  };
};
