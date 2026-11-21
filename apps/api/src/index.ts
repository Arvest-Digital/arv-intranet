import { databaseLayer, openDatabase } from '@arv/db';
import { identityRoutes } from '@arv/identity/http';
import { orgRoutes } from '@arv/org/http';
import { errorBody } from '@arv/platform/http';
import { projectsRoutes } from '@arv/projects/http';
import { SchedulingApi } from '@arv/scheduling';
import { schedulingRoutes } from '@arv/scheduling/http';
import { Effect } from 'effect';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { requestId } from 'hono/request-id';
import { makeScheduledLayer } from './composition';
import type { AppEnv, Bindings } from './env';
import { authenticate } from './middleware/authenticate';
import { provideAppLayer } from './middleware/provide-app-layer';

/** The fetch entry point's router; tests read its routes. */
export const app = new Hono<AppEnv>()
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

/**
 * The Cron Trigger entry point (`triggers.crons` in wrangler.jsonc). Its one cron, `0 3 1 * *`,
 * runs scheduling's monthly allocation-history purge (resource-scheduling sad §7, QS-5). A failure
 * rejects, so the run is reported failed and alerts; the next month's run catches up.
 */
const scheduled: ExportedHandlerScheduledHandler<Bindings> = async (_controller, env) => {
  const database = databaseLayer(openDatabase(env.HYPERDRIVE.connectionString));
  await Effect.runPromise(
    Effect.flatMap(SchedulingApi, (scheduling) => scheduling.purgeExpiredHistory()).pipe(
      Effect.provide(makeScheduledLayer(env, database)),
    ),
  );
};

export default { fetch: app.fetch, scheduled } satisfies ExportedHandler<Bindings>;
