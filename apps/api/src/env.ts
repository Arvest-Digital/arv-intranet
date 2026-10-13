/**
 * Bindings are declared by hand instead of using the generated global `Env`: `apps/web` type-imports
 * this app (for `AppType`) and has its own global `Env`, so the two would clash.
 * Keep in sync with wrangler.jsonc.
 */
export type Bindings = {
  HYPERDRIVE: Hyperdrive;
};

export type AppEnv = {
  Bindings: Bindings;
};
