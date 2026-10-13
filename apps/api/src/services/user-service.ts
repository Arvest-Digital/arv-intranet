import { Conflict, type CreateUserInput, NotFound, type User } from '@arv/contracts';
import type { DbError } from '@arv/db';
import { Context, Effect, Layer, Option } from 'effect';
import { UserRepo } from '../repositories/user-repo';

export class UserService extends Context.Tag('UserService')<
  UserService,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<User>, DbError>;
    readonly get: (id: string) => Effect.Effect<User, NotFound | DbError>;
    readonly create: (input: CreateUserInput) => Effect.Effect<User, Conflict | DbError>;
  }
>() {}

export const UserServiceLive = Layer.effect(
  UserService,
  Effect.gen(function* () {
    const repo = yield* UserRepo;

    return {
      list: repo.list,
      get: (id) =>
        repo.findById(id).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new NotFound({ resource: 'User', id })),
              onSome: Effect.succeed,
            }),
          ),
        ),
      create: (input) =>
        Effect.gen(function* () {
          const existing = yield* repo.findByEmail(input.email);
          if (Option.isSome(existing)) {
            return yield* new Conflict({
              message: `User with email ${input.email} already exists`,
            });
          }
          return yield* repo.create(input);
        }),
    };
  }),
);
