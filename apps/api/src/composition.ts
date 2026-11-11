import { DatabaseLive, UnitOfWorkLive } from '@arv/db';
import { identityPermissions } from '@arv/identity';
import { IdentityConfig, IdentityModuleLive, permissionCatalogLayer } from '@arv/identity/layer';
import { type Actor, CurrentActor } from '@arv/kernel';
import { Layer } from 'effect';
import type { Bindings } from './env';

/**
 * Interim until T20 reads `IdentityConfig` and the Google secret from env: no sign-in route is
 * mounted yet, so nothing reads them. The catalog is every module's declarations (identity's today).
 */
const IdentityHostLive = Layer.merge(
  permissionCatalogLayer(identityPermissions),
  Layer.succeed(IdentityConfig, {
    companyDomain: '',
    firstAdminEmail: '',
    signInReturnUrl: '',
    googleClientId: 'unset-until-t20',
  }),
);

// provideMerge: route handlers read the catalog too (combined permissions on the access list).
const IdentityLive = IdentityModuleLive({ google: { clientSecret: 'unset-until-t20' } }).pipe(
  Layer.provideMerge(IdentityHostLive),
);

/**
 * The only place that knows every module. Stack module Layers in dependency order, dependents
 * first and the foundation last, so a cycle between modules can't be expressed.
 */
const ModulesLive = Layer.empty.pipe(
  Layer.provideMerge(IdentityLive), // foundation
);

/** Built per request: Workers bindings and connections are request-scoped. */
export const makeAppLayer = (env: Bindings, actor: Actor) =>
  ModulesLive.pipe(
    Layer.provideMerge(Layer.merge(UnitOfWorkLive, Layer.succeed(CurrentActor, actor))),
    // One Database for the request: modules and UnitOfWork share it.
    Layer.provide(DatabaseLive(env.HYPERDRIVE.connectionString)),
  );

/** Everything route handlers may depend on, derived from the composed Layer. */
export type AppServices = Layer.Layer.Success<ReturnType<typeof makeAppLayer>>;

/** Just enough to resolve the actor, before the full app Layer exists. */
export const makeIdentityLayer = (env: Bindings) =>
  IdentityLive.pipe(Layer.provide(DatabaseLive(env.HYPERDRIVE.connectionString)));
