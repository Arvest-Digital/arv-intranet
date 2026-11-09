import { Database, type DbError, query } from '@arv/db';
import { UserId } from '@arv/kernel';
import { asc, eq, type SQL } from 'drizzle-orm';
import { Effect, Layer, Option } from 'effect';
import { UserRepository } from '../application/ports';
import { User } from '../domain/user';
import { users } from './schema';

type Row = typeof users.$inferSelect;

const toUser = (row: Row) => new User({ ...row, id: UserId.make(row.id) });

// The extended port's access-role and lifecycle methods land with the adapter work in T09.
const notImplemented = (method: string) => Effect.dieMessage(`not implemented (T09): ${method}`);

export const DrizzleUserRepositoryLive = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    // Resolved once, so the port's methods have no requirements. DB failures become defects.
    const database = yield* Database;
    const run = <A>(effect: Effect.Effect<A, DbError, Database>) =>
      effect.pipe(Effect.provideService(Database, database), Effect.orDie);

    const findOne = (where: SQL) =>
      run(
        query((db) => db.select().from(users).where(where).limit(1)).pipe(
          Effect.map((rows) => Option.fromNullable(rows[0]).pipe(Option.map(toUser))),
        ),
      );

    return {
      list: () =>
        run(
          query((db) => db.select().from(users).orderBy(asc(users.createdAt))).pipe(
            Effect.map((rows) => rows.map(toUser)),
          ),
        ),
      findById: (id) => findOne(eq(users.id, id)),
      findByEmail: (email) => findOne(eq(users.email, email)),
      create: (input, accessRoleIds = []) =>
        accessRoleIds.length > 0
          ? notImplemented('create with access roles')
          : run(
              query((db) => db.insert(users).values(input).returning()).pipe(
                // INSERT … RETURNING always yields the inserted row.
                Effect.map((rows) => toUser(rows[0] as Row)),
              ),
            ),
      rename: () => notImplemented('rename'),
      delete: () => notImplemented('delete'),
      accessRoleIds: () => notImplemented('accessRoleIds'),
      setAccessRoles: () => notImplemented('setAccessRoles'),
    };
  }),
);
