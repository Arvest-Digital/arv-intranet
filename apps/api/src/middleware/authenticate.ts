import { IdentityApi } from '@arv/identity';
import { Effect, Option } from 'effect';
import { createMiddleware } from 'hono/factory';
import { makeIdentityLayer } from '../composition';
import type { AppEnv } from '../env';

/** Resolves the request's actor through the identity module and stores it as `actor`. */
export const authenticate = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    const token = Option.fromNullable(c.req.header('authorization')).pipe(
      Option.filter((header) => header.startsWith('Bearer ')),
      Option.map((header) => header.slice('Bearer '.length)),
    );
    const actor = await Effect.runPromise(
      Effect.flatMap(IdentityApi, (identity) => identity.resolveActor(token)).pipe(
        Effect.provide(makeIdentityLayer(c.env)),
      ),
    );
    c.set('actor', actor);
    await next();
  });
