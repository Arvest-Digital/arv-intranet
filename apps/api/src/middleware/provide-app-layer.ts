import { createMiddleware } from 'hono/factory';
import { makeAppLayer } from '../composition';
import type { AppEnv } from '../env';
import { requestDatabase } from './request-database';

/**
 * Puts the per-request app Layer on the context, where `runEffect` (@arv/platform) reads it. It
 * shares the access check's Database, so the request connects once.
 */
export const provideAppLayer = () =>
  createMiddleware<AppEnv>(async (c, next) => {
    c.set('appLayer', makeAppLayer(c.env, c.get('actor'), requestDatabase(c)));
    await next();
  });
