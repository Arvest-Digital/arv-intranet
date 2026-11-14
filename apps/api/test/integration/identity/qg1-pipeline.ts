import { env } from 'cloudflare:test';
import { createDb, Database, DatabaseLive, UnitOfWorkLive } from '@arv/db';
import { identityPermissions } from '@arv/identity';
import { identityRoutes } from '@arv/identity/http';
import { IdentityConfig, IdentityModuleLive, permissionCatalogLayer } from '@arv/identity/layer';
import { type Actor, CurrentActor, Permission, requirePermission } from '@arv/kernel';
import { errorBody, type HttpEnv, runEffectNoContent } from '@arv/platform/http';
import { Layer } from 'effect';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type pg from 'pg';
import type { AppEnv } from '../../../src/env';
import { authenticate } from '../../../src/middleware/authenticate';

/**
 * The QG-1 suites' copy of the host pipeline (sad §10 scenarios 1a–1c): the real `authenticate`
 * and identity's real module Layer on the test database, with nothing cached in between. The
 * catalog adds a test-declared `scheduling:edit-allocations` and two stand-in feature routes, so
 * a feature's check can be exercised without the scheduling module (AC-17, AC-18).
 */

export const MANAGE_ACCESS = 'identity:manage-access';
export const EDIT_ALLOCATIONS = Permission.make('scheduling:edit-allocations');
/** Granted by roles in the database, but declared by no module (AC-18). */
export const UNDECLARED = Permission.make('scheduling:approve-everything');

const editAllocations = {
  key: EDIT_ALLOCATIONS,
  name: 'Edit allocations',
  description: 'Create, change and remove allocations on the schedule board.',
  feature: 'Resource scheduling',
};

const config: IdentityConfig['Type'] = {
  companyDomain: 'example.test', // the fixtures' default email domain
  firstAdminEmail: '',
  signInReturnUrl: 'https://intranet.example.test/sign-in/return',
  googleClientId: 'test-client.apps.example.test',
};

const IdentityTestLive = IdentityModuleLive({
  google: {
    clientSecret: 'test-secret',
    fetch: () => Promise.reject(new Error('no network in tests')),
  },
}).pipe(
  Layer.provideMerge(
    Layer.merge(
      permissionCatalogLayer([...identityPermissions, editAllocations]),
      Layer.succeed(IdentityConfig, config),
    ),
  ),
);

/** A `Database` whose every query fails, as if Postgres were down mid-request. */
export const FailingDatabase = Layer.sync(Database, () =>
  createDb({
    query: () => Promise.reject(new Error('database unavailable (test)')),
  } as unknown as pg.Pool),
);

const LiveDatabase = (bindings: { HYPERDRIVE: Hyperdrive }) =>
  DatabaseLive(bindings.HYPERDRIVE.connectionString);

/** Stand-ins for a feature's actions: each runs the one shared check and nothing else. */
const featureStandIns = new Hono<HttpEnv>()
  .post('/test-scheduling/allocations', (c) =>
    runEffectNoContent(c, requirePermission(EDIT_ALLOCATIONS)),
  )
  .post('/test-scheduling/approvals', (c) => runEffectNoContent(c, requirePermission(UNDECLARED)));

/** The pipeline over the given `Database`: the test database unless a failing one is passed. */
export const makeTestApp = (database?: Layer.Layer<Database>) => {
  const databaseFor = (bindings: { HYPERDRIVE: Hyperdrive }) => database ?? LiveDatabase(bindings);
  const appLayer = (bindings: { HYPERDRIVE: Hyperdrive }, actor: Actor) =>
    IdentityTestLive.pipe(
      Layer.provideMerge(Layer.merge(UnitOfWorkLive, Layer.succeed(CurrentActor, actor))),
      Layer.provide(databaseFor(bindings)),
    );

  const app = new Hono<AppEnv>()
    .use(authenticate((bindings) => IdentityTestLive.pipe(Layer.provide(databaseFor(bindings)))))
    .use(
      createMiddleware<AppEnv>(async (c, next) => {
        c.set('appLayer', appLayer(c.env, c.get('actor')));
        await next();
      }),
    )
    .route('/', identityRoutes)
    .route('/', featureStandIns);
  // As the host: a defect (e.g. the actor could not be resolved) is a 500, never a pass.
  app.onError((_, c) =>
    c.json(errorBody('InternalError', 'platform.internal_error', 'Internal server error'), 500),
  );

  return { fetch: async (request: Request) => app.fetch(request, env), routes: app.routes };
};

export type Call = { readonly method?: string; readonly token?: string; readonly body?: unknown };

export const request = (path: string, { method = 'GET', token, body }: Call = {}) => {
  const headers = new Headers();
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request(`http://api.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

export const errorOf = async (res: Response) =>
  ((await res.json()) as { error: Record<string, unknown> }).error;
