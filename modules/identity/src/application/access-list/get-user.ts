import { requirePermission, type UserId } from '@arv/kernel';
import { Effect } from 'effect';
import { MANAGE_ACCESS } from '../../permissions';
import { describeUser, findUser } from './user-access';

/** One user with their roles and combined permissions (Flow 8, first step; AC-12). */
export const getUser = (id: UserId) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_ACCESS);
    return yield* describeUser(yield* findUser(id));
  });
