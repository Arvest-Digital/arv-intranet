// Types for `cloudflare:test` / `cloudflare:workers` in integration tests.
declare namespace Cloudflare {
  interface Env extends Pick<import('../src/env').Bindings, keyof import('../src/env').Bindings> {}
  interface GlobalProps {
    mainModule: typeof import('../src/index');
  }
}
