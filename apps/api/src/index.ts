import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import type { AppEnv } from './env';
import { errorBody } from './http/errors';
import { usersRoutes } from './http/routes/users';

const app = new Hono<AppEnv>()
  .use(requestId())
  .use(logger())
  .get('/health', (c) => c.json({ ok: true }))
  .route('/users', usersRoutes);

app.notFound((c) => c.json(errorBody('NotFound', 'Route not found'), 404));
app.onError((err, c) => {
  console.error(err);
  return c.json(errorBody('InternalError', 'Internal server error'), 500);
});

/** Route types for the typed client in apps/web (`hc<AppType>`). */
export type AppType = typeof app;

export default app;
