import { requirePermission } from '@arv/kernel';
import { Effect } from 'effect';
import { MANAGE_ACCESS } from '../../permissions';
import { AccessRoleRepository } from '../ports';
import { toAccessRoleView } from './access-role-view';

/** Flow 10 and the add-user form: every role, retired keys flagged, holders counted (AC-13, AC-16). */
export const listAccessRoles = () =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_ACCESS);
    const roles = yield* AccessRoleRepository;
    return yield* Effect.forEach(yield* roles.list(), toAccessRoleView);
  });
