import { requirePermission, UnitOfWork, type UserId } from '@arv/kernel';
import { Effect } from 'effect';
import { assertAdminRemains } from '../../domain/last-admin';
import { MANAGE_ACCESS } from '../../permissions';
import { type AccessRoleId, AccessRoleRepository, UserRepository } from '../ports';
import { describeUser, findUser, requireAccessRoles } from './user-access';

/**
 * Flow 8: the user holds exactly `accessRoleIds` (empty allowed) from their next request, and the
 * result lists their combined permissions in plain words (AC-12). One transaction with the
 * last-admin check: taking «Admin» from the only admin fails `LastAdminRequired` and nothing
 * changes (AC-14).
 */
export const setUserAccessRoles = (id: UserId, accessRoleIds: ReadonlyArray<AccessRoleId>) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_ACCESS);
    const users = yield* UserRepository;
    const accessRoles = yield* AccessRoleRepository;
    const unitOfWork = yield* UnitOfWork;

    return yield* unitOfWork.transactional(
      Effect.gen(function* () {
        const user = yield* findUser(id);
        yield* users.setAccessRoles(id, yield* requireAccessRoles(accessRoleIds));
        yield* assertAdminRemains(yield* accessRoles.countManageAccessHolders());
        return yield* describeUser(user);
      }),
    );
  });
