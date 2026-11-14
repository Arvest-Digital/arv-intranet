import { requirePermission, UnitOfWork } from '@arv/kernel';
import { Effect, Option } from 'effect';
import { AccessRoleNotFound } from '../../domain/errors';
import { assertAdminRemains } from '../../domain/last-admin';
import { MANAGE_ACCESS } from '../../permissions';
import { type AccessRoleId, AccessRoleRepository } from '../ports';

/**
 * Flow 7 (AC-11, AC-14). The warning is `getAccessRole`'s `holderCount` and `isPreselected`; web
 * calls this only after the admin confirms (openapi `deleteAccessRole` has no confirm flag).
 * Deletes the role, its grants, assignments and pre-selected mark, then checks an admin remains.
 */
export const deleteAccessRole = (id: AccessRoleId) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_ACCESS);
    const roles = yield* AccessRoleRepository;
    const unitOfWork = yield* UnitOfWork;

    yield* unitOfWork.transactional(
      Effect.gen(function* () {
        const current = yield* roles.findById(id);
        if (Option.isNone(current)) return yield* new AccessRoleNotFound({ id });
        if (!(yield* roles.delete(id))) return yield* new AccessRoleNotFound({ id });
        if (current.value.permissionKeys.includes(MANAGE_ACCESS)) {
          yield* assertAdminRemains(yield* roles.countManageAccessHolders());
        }
      }),
    );
  });
