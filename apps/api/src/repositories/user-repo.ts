import type { CreateUserInput, User } from '@arv/contracts';
import { Database, type DbError, query, schema } from '@arv/db';
import { asc, eq } from 'drizzle-orm';
import { Context, Effect, Layer, Option } from 'effect';

export class UserRepo extends Context.Tag('UserRepo')<
  UserRepo,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<User>, DbError>;
    readonly findById: (id: string) => Effect.Effect<Option.Option<User>, DbError>;
    readonly findByEmail: (email: string) => Effect.Effect<Option.Option<User>, DbError>;
    readonly create: (input: CreateUserInput) => Effect.Effect<User, DbError>;
  }
>() {}

const { users } = schema;

export const UserRepoLive = Layer.effect(
  UserRepo,
  Effect.gen(function* () {
    const db = yield* Database;

    const findOne = (where: ReturnType<typeof eq>) =>
      query(() => db.select().from(users).where(where).limit(1)).pipe(
        Effect.map((rows) => Option.fromNullable(rows[0])),
      );

    return {
      list: () => query(() => db.select().from(users).orderBy(asc(users.createdAt))),
      findById: (id) => findOne(eq(users.id, id)),
      findByEmail: (email) => findOne(eq(users.email, email)),
      create: (input) =>
        query(() => db.insert(users).values(input).returning()).pipe(
          // INSERT … RETURNING always yields the inserted row.
          Effect.map((rows) => rows[0] as User),
        ),
    };
  }),
);
