import { DatabaseLive } from '@arv/db';
import { IdentityModuleLive } from '@arv/identity/layer';
import { type Actor, CurrentActor } from '@arv/kernel';
import { Layer } from 'effect';
import type { Bindings } from './env';

/**
 * The only place that knows every module. Stack module Layers in dependency order, dependents
 * first and the foundation last, so a cycle between modules can't be expressed.
 */
const ModulesLive = Layer.empty.pipe(
  Layer.provideMerge(IdentityModuleLive), // foundation
);

/** Built per request: Workers bindings and connections are request-scoped. */
export const makeAppLayer = (env: Bindings, actor: Actor) =>
  ModulesLive.pipe(
    Layer.provideMerge(Layer.succeed(CurrentActor, actor)),
    Layer.provide(DatabaseLive(env.HYPERDRIVE.connectionString)),
  );

/** Everything route handlers may depend on, derived from the composed Layer. */
export type AppServices = Layer.Layer.Success<ReturnType<typeof makeAppLayer>>;

/** Just enough to resolve the actor, before the full app Layer exists. */
export const makeIdentityLayer = (env: Bindings) =>
  IdentityModuleLive.pipe(Layer.provide(DatabaseLive(env.HYPERDRIVE.connectionString)));
