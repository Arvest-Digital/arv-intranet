import { Database, type DbError, type Executor, query } from '@arv/db';
import { UserId } from '@arv/kernel';
import { and, asc, eq, notInArray, type SQL } from 'drizzle-orm';
import { Effect, Layer, Option } from 'effect';
import { AccessRoleId, UserRepository } from '../application/ports';
import { EmailTaken } from '../domain/errors';
import { User } from '../domain/user';
import { userAccessRoles, users } from './schema';

type Row = typeof users.$inferSelect;

const toUser = (row: Row) => new User({ ...row, id: UserId.make(row.id) });

/** Adds the assignments the user lacks; an unknown user or role id is an FK defect. */
const insertAssignments = (
  db: Executor,
  userId: string,
  accessRoleIds: ReadonlyArray<AccessRoleId>,
) =>
  accessRoleIds.length === 0
    ? Promise.resolve()
    : db
        .insert(userAccessRoles)
        .values([...new Set(accessRoleIds)].map((accessRoleId) => ({ userId, accessRoleId })))
        .onConflictDoNothing()
        .then(() => undefined);

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
          query((db) => db.select().from(users).orderBy(asc(users.createdAt), asc(users.id))).pipe(
            Effect.map((rows) => rows.map(toUser)),
          ),
        ),
      findById: (id) => findOne(eq(users.id, id)),
      findByEmail: (email) => findOne(eq(users.email, email)),
      // ON CONFLICT DO NOTHING instead of catching 23505: a failed statement would abort an
      // enclosing UnitOfWork transaction, while a skipped insert leaves it usable (AC-06).
      // User and assignments are two statements; the use case wraps them in `UnitOfWork`.
      create: (input, accessRoleIds = []) =>
        run(
          query((db) =>
            db
              .insert(users)
              .values({ email: input.email, name: input.name })
              .onConflictDoNothing({ target: users.email })
              .returning(),
          ),
        ).pipe(
          Effect.flatMap(([row]) =>
            row === undefined
              ? Effect.fail(new EmailTaken({ email: input.email }))
              : run(query((db) => insertAssignments(db, row.id, accessRoleIds))).pipe(
                  Effect.as(toUser(row)),
                ),
          ),
        ),
      rename: (id, name) =>
        run(
          query((db) => db.update(users).set({ name }).where(eq(users.id, id)).returning()).pipe(
            Effect.map((rows) => Option.fromNullable(rows[0]).pipe(Option.map(toUser))),
          ),
        ),
      // Assignments cascade; sessions keep their rows with user_id NULL (AC-07).
      delete: (id) =>
        run(
          query((db) => db.delete(users).where(eq(users.id, id)).returning({ id: users.id })).pipe(
            Effect.map((rows) => rows.length > 0),
          ),
        ),
      accessRoleIds: (id) =>
        run(
          query((db) =>
            db
              .select({ accessRoleId: userAccessRoles.accessRoleId })
              .from(userAccessRoles)
              .where(eq(userAccessRoles.userId, id))
              .orderBy(asc(userAccessRoles.createdAt), asc(userAccessRoles.accessRoleId)),
          ).pipe(Effect.map((rows) => rows.map((row) => AccessRoleId.make(row.accessRoleId)))),
        ),
      // Only the difference changes, so unchanged assignments keep their created_at. Two
      // statements; the use case wraps them in `UnitOfWork`.
      setAccessRoles: (id, accessRoleIds) =>
        run(
          query((db) =>
            db
              .delete(userAccessRoles)
              .where(
                and(
                  eq(userAccessRoles.userId, id),
                  accessRoleIds.length === 0
                    ? undefined
                    : notInArray(userAccessRoles.accessRoleId, [...accessRoleIds]),
                ),
              ),
          ).pipe(Effect.zipRight(query((db) => insertAssignments(db, id, accessRoleIds)))),
        ),
    };
  }),
);
