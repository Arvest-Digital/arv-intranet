import { requirePermission, UnitOfWork, type UserId } from '@arv/kernel';
import { Effect } from 'effect';
import { UserNotFound } from '../../domain/errors';
import { assertAdminRemains } from '../../domain/last-admin';
import { MANAGE_ACCESS } from '../../permissions';
import { AccessRoleRepository, SessionRepository, UserRepository } from '../ports';

/**
 * Critical flow 3: in one transaction, revokes every session of the user as `access-removed`
 * (AC-07), deletes the user with their role assignments, then checks an admin remains; if none
 * does, `LastAdminRequired` rolls everything back (AC-14).
 */
export const removeUser = (id: UserId) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_ACCESS);
    const users = yield* UserRepository;
    const sessions = yield* SessionRepository;
    const accessRoles = yield* AccessRoleRepository;
    const unitOfWork = yield* UnitOfWork;

    yield* unitOfWork.transactional(
      Effect.gen(function* () {
        // Revoke before deleting: the delete detaches the session rows from the user.
        yield* sessions.revokeAllForUser(id, 'access-removed');
        if (!(yield* users.delete(id))) return yield* new UserNotFound({ id });
        yield* assertAdminRemains(yield* accessRoles.countManageAccessHolders());
      }),
    );
  });
