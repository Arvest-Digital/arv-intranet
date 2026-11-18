// Types for `cloudflare:test` / `cloudflare:workers` in integration tests.
declare namespace Cloudflare {
  interface Env extends Pick<import('../src/env').Bindings, keyof import('../src/env').Bindings> {}
  interface GlobalProps {
    mainModule: typeof import('../src/index');
  }
}

/** A file's text, imported with Vite's `?raw` suffix (the redaction matrix reads openapi.yaml). */
declare module '*?raw' {
  const text: string;
  export default text;
}
