import { identityRoutes } from '@arv/identity/http';
import { errorBody } from '@arv/platform/http';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import type { AppEnv } from './env';
import { authenticate } from './middleware/authenticate';
import { provideAppLayer } from './middleware/provide-app-layer';

const app = new Hono<AppEnv>()
  .use(requestId())
  .use(logger())
  .get('/health', (c) => c.json({ ok: true }))
  .use(authenticate())
  .use(provideAppLayer())
  .route('/', identityRoutes);

app.notFound((c) => c.json(errorBody('NotFound', 'Route not found'), 404));
app.onError((err, c) => {
  console.error(err);
  return c.json(errorBody('InternalError', 'Internal server error'), 500);
});

export type AppType = typeof app;
/** Per-module route types for the typed clients in apps/web (`hc<IdentityRoutes>`). */
export type { IdentityRoutes } from '@arv/identity/http';

export default app;
