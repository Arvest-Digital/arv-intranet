import { identityRoutes } from '@arv/identity/http';
import { orgRoutes } from '@arv/org/http';
import { errorBody } from '@arv/platform/http';
import { projectsRoutes } from '@arv/projects/http';
import { schedulingRoutes } from '@arv/scheduling/http';
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
  .route('/', identityRoutes)
  .route('/', orgRoutes)
  .route('/', projectsRoutes)
  .route('/', schedulingRoutes);

app.notFound((c) => c.json(errorBody('NotFound', 'platform.not_found', 'Route not found'), 404));
app.onError((err, c) => {
  console.error(err);
  return c.json(
    errorBody('InternalError', 'platform.internal_error', 'Internal server error'),
    500,
  );
});

export type AppType = typeof app;
/** Per-module route types for the typed clients in apps/web (`hc<IdentityRoutes>`). */
export type { IdentityRoutes } from '@arv/identity/http';
export type { OrgRoutes } from '@arv/org/http';
export type { ProjectsRoutes } from '@arv/projects/http';
export type { SchedulingRoutes } from '@arv/scheduling/http';

export default app;
