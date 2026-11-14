import { type Database, databaseLayer, openDatabase } from '@arv/db';
import type { Layer } from 'effect';
import type { Context } from 'hono';
import type { AppEnv } from '../env';

/**
 * The request's one Database, opened on first use and kept on the context, so the access check
 * and the request's work share one pool and connect at most once. Opening only builds the pool;
 * it connects on the first query, so a request that never queries pays nothing.
 */
export const requestDatabase = (c: Context<AppEnv>): Layer.Layer<Database> => {
  const opened = c.get('database') as AppEnv['Variables']['database'] | undefined;
  const db = opened ?? openDatabase(c.env.HYPERDRIVE.connectionString);
  if (!opened) c.set('database', db);
  return databaseLayer(db);
};
