import { env } from 'cloudflare:test';
import { Database, DatabaseLive, query, UnitOfWorkLive } from '@arv/db';
import { makeUser, seedUsers } from '@arv/db/testing';
import { Actor, UnitOfWork } from '@arv/kernel';
import { Data, Effect, Exit, Fiber, Layer } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeAppLayer } from '../../../src/composition';
import { resetDb, withDb } from '../../helpers';

beforeEach(resetDb);

class Boom extends Data.TaggedError('Boom') {}

const TestLayer = UnitOfWorkLive.pipe(
  Layer.provideMerge(DatabaseLive(env.HYPERDRIVE.connectionString)),
);

const run = <A, E>(effect: Effect.Effect<A, E, UnitOfWork | Database>) =>
  Effect.runPromiseExit(effect.pipe(Effect.provide(TestLayer)));

const insert = (name: string) =>
  query((db) => seedUsers(db, [makeUser({ name })])).pipe(Effect.orDie);

/** Names committed to the database, read on a separate connection. */
const committedNames = () =>
  withDb(async (db) => {
    const { rows } = await db.execute<{ name: string }>(
      'SELECT name FROM identity.users ORDER BY name',
    );
    return rows.map((r) => r.name);
  });

/** Users visible to the current `query()`: inside a transaction, its uncommitted rows too. */
const countUsers = query((db) =>
  db.execute<{ count: number }>('SELECT count(*)::int AS count FROM identity.users'),
).pipe(
  Effect.orDie,
  Effect.map(({ rows }) => rows[0]?.count),
);

const transactional = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.flatMap(UnitOfWork, (uow) => uow.transactional(effect));

describe('UnitOfWorkLive', () => {
  it("is provided by the app Layer and wraps the modules' queries", async () => {
    const exit = await Effect.runPromiseExit(
      transactional(Effect.fail(new Boom())).pipe(
        Effect.provide(
          makeAppLayer(env, Actor.Anonymous(), DatabaseLive(env.HYPERDRIVE.connectionString)),
        ),
      ),
    );
    expect(exit).toEqual(Exit.fail(new Boom()));
  });

  it('commits every query when the effect succeeds', async () => {
    const exit = await run(
      transactional(Effect.zipRight(insert('Ann'), insert('Bob')).pipe(Effect.as('done'))),
    );
    expect(exit).toEqual(Exit.succeed('done'));
    expect(await committedNames()).toEqual(['Ann', 'Bob']);
  });

  it('rolls back and re-raises a typed failure', async () => {
    const exit = await run(transactional(Effect.zipRight(insert('Ann'), Effect.fail(new Boom()))));
    expect(exit).toEqual(Exit.fail(new Boom()));
    expect(await committedNames()).toEqual([]);
  });

  it('rolls back on a defect', async () => {
    const exit = await run(transactional(Effect.zipRight(insert('Ann'), Effect.die('kaboom'))));
    expect(exit).toEqual(Exit.die('kaboom'));
    expect(await committedNames()).toEqual([]);
  });

  it('rolls back when a later query fails (e.g. unique violation)', async () => {
    const dup = makeUser({ email: 'ann@arvest.digital', name: 'Ann' });
    const exit = await run(
      transactional(
        query((db) => seedUsers(db, [dup])).pipe(
          Effect.zipRight(query((db) => seedUsers(db, [{ ...dup, name: 'Ann 2' }]))),
        ),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(await committedNames()).toEqual([]);
  });

  it('keeps uncommitted writes invisible outside the transaction', async () => {
    let seenOutside: string[] = ['not read'];
    const exit = await run(
      transactional(
        Effect.zipRight(
          insert('Ann'),
          Effect.promise(async () => {
            seenOutside = await committedNames();
          }),
        ),
      ),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    expect(seenOutside).toEqual([]);
    expect(await committedNames()).toEqual(['Ann']);
  });

  it('joins the outer transaction when nested: an outer failure undoes the inner work', async () => {
    const exit = await run(
      transactional(
        transactional(insert('Ann')).pipe(
          Effect.zipRight(insert('Bob')),
          Effect.zipRight(Effect.fail(new Boom())),
        ),
      ),
    );
    expect(exit).toEqual(Exit.fail(new Boom()));
    expect(await committedNames()).toEqual([]);
  });

  it('joins the outer transaction when nested: an inner failure undoes the outer work', async () => {
    let seenInside: unknown;
    const exit = await run(
      transactional(
        Effect.zipRight(
          Effect.zipRight(insert('Ann'), insert('Bob')),
          transactional(
            insert('Cid').pipe(
              // Joined, not a new transaction: the outer, uncommitted rows are visible here.
              Effect.zipRight(countUsers),
              Effect.tap((count) => {
                seenInside = count;
              }),
              Effect.zipRight(Effect.fail(new Boom())),
            ),
          ),
        ),
      ),
    );
    expect(exit).toEqual(Exit.fail(new Boom()));
    expect(seenInside).toBe(3);
    expect(await committedNames()).toEqual([]);
  });

  it('routes queries through the transaction even when Database was captured up front', async () => {
    // Repositories resolve Database once at Layer build and provide it to each query.
    const exit = await run(
      Effect.gen(function* () {
        const database = yield* Database;
        const repoInsert = (name: string) =>
          insert(name).pipe(Effect.provideService(Database, database));
        return yield* transactional(Effect.zipRight(repoInsert('Ann'), Effect.fail(new Boom())));
      }),
    );
    expect(exit).toEqual(Exit.fail(new Boom()));
    expect(await committedNames()).toEqual([]);
  });

  it('includes queries from forked fibers', async () => {
    const exit = await run(
      transactional(
        Effect.all([insert('Ann'), insert('Bob')], { concurrency: 'unbounded' }).pipe(
          Effect.zipRight(Effect.fail(new Boom())),
        ),
      ),
    );
    expect(exit).toEqual(Exit.fail(new Boom()));
    expect(await committedNames()).toEqual([]);
  });

  it('rolls back when interrupted', async () => {
    const exit = await run(
      Effect.gen(function* () {
        const fiber = yield* Effect.fork(
          transactional(Effect.zipRight(insert('Ann'), Effect.never)),
        );
        // Let the insert land inside the open transaction before interrupting.
        yield* Effect.sleep('200 millis');
        return yield* Fiber.interrupt(fiber);
      }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
    if (Exit.isSuccess(exit)) expect(Exit.isInterrupted(exit.value)).toBe(true);
    expect(await committedNames()).toEqual([]);
  });

  it('leaves queries after the transaction outside it', async () => {
    const exit = await run(
      transactional(insert('Ann')).pipe(
        Effect.zipRight(insert('Bob')),
        Effect.zipRight(transactional(Effect.zipRight(insert('Cid'), Effect.fail(new Boom())))),
      ),
    );
    expect(exit).toEqual(Exit.fail(new Boom()));
    expect(await committedNames()).toEqual(['Ann', 'Bob']);
  });
});
