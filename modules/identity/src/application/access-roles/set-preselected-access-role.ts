import { requirePermission, UnitOfWork } from '@arv/kernel';
import { Effect, Option } from 'effect';
import { AccessRoleNotFound } from '../../domain/errors';
import { MANAGE_ACCESS } from '../../permissions';
import { type AccessRoleId, AccessRoleRepository } from '../ports';

/**
 * Flow 9 (AC-13): marks `id` as the only pre-selected role, or clears the mark with `null`.
 * Changes no existing user's roles. Returns the mark as saved.
 */
export const setPreselectedAccessRole = (id: AccessRoleId | null) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_ACCESS);
    const roles = yield* AccessRoleRepository;
    const unitOfWork = yield* UnitOfWork;

    return yield* unitOfWork.transactional(
      Effect.gen(function* () {
        if (id !== null && Option.isNone(yield* roles.findById(id))) {
          return yield* new AccessRoleNotFound({ id });
        }
        yield* roles.setPreselected(id);
        return { accessRoleId: id };
      }),
    );
  });
