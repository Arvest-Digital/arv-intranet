import { DatabaseLive, UnitOfWorkLive } from '@arv/db';
import { identityPermissions } from '@arv/identity';
import { IdentityConfig, IdentityModuleLive, permissionCatalogLayer } from '@arv/identity/layer';
import { type Actor, CurrentActor } from '@arv/kernel';
import { Layer } from 'effect';
import type { Bindings } from './env';

/**
 * Every module's permission declarations (ADR-0004). Add a module's declarations here when it
 * lands; nothing else builds the catalog.
 */
const PermissionCatalogLive = permissionCatalogLayer([...identityPermissions]);

/**
 * Identity's configuration from the api's env (sad §7). A missing value reads as empty, which
 * fails closed: with no company domain every sign-in is refused, with no first admin none is made.
 */
const identityConfigFrom = (env: Bindings): IdentityConfig['Type'] => ({
  companyDomain: env.COMPANY_EMAIL_DOMAIN ?? '',
  firstAdminEmail: env.FIRST_ADMIN_EMAIL ?? '',
  signInReturnUrl: env.SIGN_IN_RETURN_URL ?? '',
  googleClientId: env.GOOGLE_CLIENT_ID ?? '',
});

// provideMerge: route handlers read the catalog too (combined permissions on the access list).
const IdentityLive = (env: Bindings) =>
  IdentityModuleLive({ google: { clientSecret: env.GOOGLE_CLIENT_SECRET ?? '' } }).pipe(
    Layer.provideMerge(
      Layer.merge(PermissionCatalogLive, Layer.succeed(IdentityConfig, identityConfigFrom(env))),
    ),
  );

/**
 * The only place that knows every module. Stack module Layers in dependency order, dependents
 * first and the foundation last, so a cycle between modules can't be expressed.
 */
const ModulesLive = (env: Bindings) =>
  Layer.empty.pipe(
    Layer.provideMerge(IdentityLive(env)), // foundation
  );

/** Built per request: Workers bindings and connections are request-scoped. */
export const makeAppLayer = (env: Bindings, actor: Actor) =>
  ModulesLive(env).pipe(
    Layer.provideMerge(Layer.merge(UnitOfWorkLive, Layer.succeed(CurrentActor, actor))),
    // One Database for the request: modules and UnitOfWork share it.
    // Identity reads only the main Hyperdrive config, whose query cache is off (ADR-0005).
    Layer.provide(DatabaseLive(env.HYPERDRIVE.connectionString)),
  );

/** Everything route handlers may depend on, derived from the composed Layer. */
export type AppServices = Layer.Layer.Success<ReturnType<typeof makeAppLayer>>;

/** Just enough to resolve the actor, before the full app Layer exists. */
export const makeIdentityLayer = (env: Bindings) =>
  IdentityLive(env).pipe(Layer.provide(DatabaseLive(env.HYPERDRIVE.connectionString)));
