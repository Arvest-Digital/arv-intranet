import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Context, Data, Effect, Layer } from 'effect';
import pg from 'pg';

/** Tables live in each module's `infrastructure/schema.ts`; this instance knows none of them. */
export type Db = NodePgDatabase;

export class Database extends Context.Tag('@arv/db/Database')<Database, Db>() {}

export class DbError extends Data.TaggedError('DbError')<{ readonly cause: unknown }> {}

export const createDb = (client: pg.Pool | pg.Client): Db =>
  drizzle({ client, casing: 'snake_case' });

/**
 * One pool per request (Workers can't share sockets across requests); Hyperdrive keeps the real
 * connection pool. `pg.Pool` connects lazily, so requests that never query pay nothing.
 * The pool is intentionally not closed: the runtime drops sockets when the request ends
 * (matches Cloudflare's Hyperdrive + node-postgres guidance; closing explicitly causes
 * "socket has been closed" rejections).
 */
export const DatabaseLive = (connectionString: string) =>
  Layer.sync(Database, () => createDb(new pg.Pool({ connectionString, max: 5 })));

/**
 * Runs a Drizzle query on the request's `Database`; failures become a typed `DbError`.
 * Every adapter goes through here, so a future `UnitOfWork` can swap in its transaction.
 */
export const query = <A>(run: (db: Db) => Promise<A>): Effect.Effect<A, DbError, Database> =>
  Effect.flatMap(Database, (db) =>
    Effect.tryPromise({ try: () => run(db), catch: (cause) => new DbError({ cause }) }),
  );
