import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle, type NodePgDatabase, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import { Context, Data, Effect, FiberRef, Layer, Option } from 'effect';
import pg from 'pg';

/** Tables live in each module's `infrastructure/schema.ts`; this instance knows none of them. */
export type Db = NodePgDatabase;

/**
 * What a query runs on: the request's `Db`, or the open transaction of a `UnitOfWork`.
 * Both expose the same query builder; only the pool-level `$client` is missing on a transaction.
 */
export type Executor = PgDatabase<
  NodePgQueryResultHKT,
  Record<string, never>,
  ExtractTablesWithRelations<Record<string, never>>
>;

export class Database extends Context.Tag('@arv/db/Database')<Database, Db>() {}

export class DbError extends Data.TaggedError('DbError')<{ readonly cause: unknown }> {}

/**
 * The transaction opened by `UnitOfWorkLive`, if any. Fiber-local, so it follows the effect
 * (and the fibers it forks) without touching any port's signature; `query()` reads it.
 */
export const CurrentTx = FiberRef.unsafeMake<Option.Option<Executor>>(Option.none());

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
 * Runs a Drizzle query on the request's `Database`, or on the current `UnitOfWork` transaction
 * when there is one; failures become a typed `DbError`. Every adapter goes through here.
 */
export const query = <A>(run: (db: Executor) => Promise<A>): Effect.Effect<A, DbError, Database> =>
  Effect.flatMap(Effect.zip(Database, FiberRef.get(CurrentTx)), ([db, tx]) =>
    Effect.tryPromise({
      try: () => run(Option.getOrElse(tx, () => db)),
      catch: (cause) => new DbError({ cause }),
    }),
  );
