import { requirePermission } from '@arv/kernel';
import { Effect } from 'effect';
import { changeGrants } from '../../domain/access-role';
import { MANAGE_ACCESS } from '../../permissions';
import { type AccessRoleInput, AccessRoleRepository, PermissionCatalog } from '../ports';
import { toAccessRoleView } from './access-role-view';

/**
 * Flow 6 (AC-09, AC-10, AC-16): only declared keys, a name key no other role has. Nobody holds
 * the new role and it is not pre-selected.
 */
export const createAccessRole = (input: AccessRoleInput) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_ACCESS);
    const catalog = yield* PermissionCatalog;
    const declared = new Set<string>(catalog.declarations().map((d) => d.key));
    const keys = yield* changeGrants([], input.permissionKeys, declared);
    const roles = yield* AccessRoleRepository;
    const created = yield* roles.create({ name: input.name, permissionKeys: [...keys] });
    return yield* toAccessRoleView(created);
  });
