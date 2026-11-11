import { createRequestHandler } from 'react-router';
import { foreignOriginResponse, isAllowedOrigin } from '../app/shared/lib/origin-check.server';

declare module 'react-router' {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    // CSRF (sad §8): refuse every state-changing request from another origin, before any action runs.
    if (!isAllowedOrigin(request)) return foreignOriginResponse();
    return requestHandler(request, { cloudflare: { env, ctx } });
  },
} satisfies ExportedHandler<Env>;
