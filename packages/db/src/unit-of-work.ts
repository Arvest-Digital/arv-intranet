import { UnitOfWork } from '@arv/kernel';
import { Effect, Exit, FiberRef, Layer, Option, Runtime } from 'effect';
import { CurrentTx, Database, DbError } from './database';

/** Thrown inside `db.transaction` to make Drizzle roll back; never escapes this file. */
const rollback = Symbol('UnitOfWork.rollback');

/**
 * `UnitOfWork` on Postgres: `transactional` runs the effect inside one `db.transaction` and
 * puts the transaction in `CurrentTx`, so every `query()` in it (in any module) joins it.
 * Success commits; a failure, defect or interruption rolls back and is re-raised unchanged.
 * A nested `transactional` joins the outer transaction (no savepoint): the whole unit commits
 * or rolls back together. A failed COMMIT/ROLLBACK is a defect (`DbError`), like any DB failure.
 * Keep transactions short and free of network calls: each one holds a Hyperdrive connection.
 */
export const UnitOfWorkLive = Layer.effect(
  UnitOfWork,
  Effect.map(Database, (db) => ({
    transactional: <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
      Effect.flatMap(FiberRef.get(CurrentTx), (current) =>
        Option.isSome(current)
          ? effect
          : Effect.flatMap(Effect.runtime<R>(), (runtime) => {
              let exit: Exit.Exit<A, E> | undefined;
              return Effect.tryPromise({
                // `signal` aborts when this fiber is interrupted, which interrupts the inner
                // effect, which rolls the transaction back.
                try: (signal) =>
                  db.transaction(async (tx) => {
                    exit = await Runtime.runPromiseExit(runtime)(
                      Effect.locally(effect, CurrentTx, Option.some<typeof tx>(tx)),
                      { signal },
                    );
                    if (Exit.isFailure(exit)) throw rollback;
                  }),
                catch: (cause) => cause,
              }).pipe(
                Effect.catchAll((cause) =>
                  cause === rollback && exit ? Effect.void : Effect.die(new DbError({ cause })),
                ),
                Effect.flatMap(() =>
                  exit ? exit : Effect.dieMessage('UnitOfWork: transaction ended without a result'),
                ),
              );
            }),
      ),
  })),
);
