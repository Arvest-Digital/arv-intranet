import { requirePermission, type UserId } from '@arv/kernel';
import { Effect, Option } from 'effect';
import { UserNotFound } from '../../domain/errors';
import type { UserName } from '../../domain/user';
import { MANAGE_ACCESS } from '../../permissions';
import { UserRepository } from '../ports';
import { describeUser } from './user-access';

/** Flow 5: corrects only the name; roles, sessions and email stay as they are (AC-21). */
export const renameUser = (id: UserId, name: UserName) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_ACCESS);
    const users = yield* UserRepository;
    const renamed = yield* users.rename(id, name);
    if (Option.isNone(renamed)) return yield* new UserNotFound({ id });
    return yield* describeUser(renamed.value);
  });
