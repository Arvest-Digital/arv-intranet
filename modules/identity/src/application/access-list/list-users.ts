import { requirePermission } from '@arv/kernel';
import { Effect } from 'effect';
import { MANAGE_ACCESS } from '../../permissions';
import { UserRepository } from '../ports';
import { describeUser } from './user-access';

/** The whole access list in creation order, each user with roles and combined permissions (AC-08). */
export const listUsers = () =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_ACCESS);
    const users = yield* UserRepository;
    return yield* Effect.forEach(yield* users.list(), describeUser);
  });
