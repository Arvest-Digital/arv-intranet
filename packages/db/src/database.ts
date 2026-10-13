import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Context, Data, Effect, Layer } from 'effect';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

export class Database extends Context.Tag('@arv/db/Database')<Database, Db>() {}

export class DbError extends Data.TaggedError('DbError')<{ readonly cause: unknown }> {}

export const createDb = (client: pg.Pool | pg.Client): Db =>
  drizzle({ client, schema, casing: 'snake_case' });

/**
 * One pool per request (Workers can't share sockets across requests); Hyperdrive keeps the real
 * connection pool. `pg.Pool` connects lazily, so requests that never query pay nothing.
 * The pool is intentionally not closed: the runtime drops sockets when the request ends
 * (matches Cloudflare's Hyperdrive + node-postgres guidance; closing explicitly causes
 * "socket has been closed" rejections).
 */
export const DatabaseLive = (connectionString: string) =>
  Layer.sync(Database, () => createDb(new pg.Pool({ connectionString, max: 5 })));

/** Wraps a Drizzle promise so failures become a typed `DbError`. */
export const query = <A>(run: () => Promise<A>): Effect.Effect<A, DbError> =>
  Effect.tryPromise({ try: run, catch: (cause) => new DbError({ cause }) });
