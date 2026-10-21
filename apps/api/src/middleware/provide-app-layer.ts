import { createMiddleware } from 'hono/factory';
import { makeAppLayer } from '../composition';
import type { AppEnv } from '../env';

/** Puts the per-request app Layer on the context, where `runEffect` (@arv/platform) reads it. */
export const provideAppLayer = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set('appLayer', makeAppLayer(c.env, c.get('actor')));
    await next();
  });
