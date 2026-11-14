import { requirePermission, UnitOfWork } from '@arv/kernel';
import { Effect, Option } from 'effect';
import { changeGrants } from '../../domain/access-role';
import { AccessRoleNotFound } from '../../domain/errors';
import { assertAdminRemains } from '../../domain/last-admin';
import { MANAGE_ACCESS } from '../../permissions';
import {
  type AccessRoleId,
  type AccessRoleInput,
  AccessRoleRepository,
  PermissionCatalog,
} from '../ports';
import { toAccessRoleView } from './access-role-view';

/**
 * Flow 6 rename/change, Flow 10 and Critical flow 3 (AC-10, AC-11, AC-14, AC-16): replaces the
 * name and the full key set. A retired key the role already grants may be kept, never added.
 * Removing manage access runs the last-admin check in the same transaction.
 */
export const updateAccessRole = (id: AccessRoleId, input: AccessRoleInput) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_ACCESS);
    const catalog = yield* PermissionCatalog;
    const roles = yield* AccessRoleRepository;
    const unitOfWork = yield* UnitOfWork;
    const declared = new Set<string>(catalog.declarations().map((d) => d.key));

    return yield* unitOfWork.transactional(
      Effect.gen(function* () {
        const current = yield* roles.findById(id);
        if (Option.isNone(current)) return yield* new AccessRoleNotFound({ id });
        const keys = yield* changeGrants(
          current.value.permissionKeys,
          input.permissionKeys,
          declared,
        );
        const updated = yield* roles.update(id, { name: input.name, permissionKeys: [...keys] });
        if (Option.isNone(updated)) return yield* new AccessRoleNotFound({ id });
        if (current.value.permissionKeys.includes(MANAGE_ACCESS) && !keys.has(MANAGE_ACCESS)) {
          yield* assertAdminRemains(yield* roles.countManageAccessHolders());
        }
        return yield* toAccessRoleView(updated.value);
      }),
    );
  });
