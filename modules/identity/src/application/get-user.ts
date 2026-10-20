import type { UserId } from '@arv/kernel';
import { Effect, Option } from 'effect';
import { UserNotFound } from '../domain/errors';
import { UserRepository } from './ports';

export const getUser = (id: UserId) =>
  Effect.flatMap(UserRepository, (repo) => repo.findById(id)).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new UserNotFound({ id })),
        onSome: Effect.succeed,
      }),
    ),
  );
