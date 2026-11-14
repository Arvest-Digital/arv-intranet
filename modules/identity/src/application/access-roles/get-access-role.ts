import { requirePermission } from '@arv/kernel';
import { Effect, Option } from 'effect';
import { AccessRoleNotFound } from '../../domain/errors';
import { MANAGE_ACCESS } from '../../permissions';
import { type AccessRoleId, AccessRoleRepository } from '../ports';
import { toAccessRoleView } from './access-role-view';

/**
 * One role. Flow 7's first step: its `holderCount` and `isPreselected` are the delete warning
 * (AC-11); the contract's `deleteAccessRole` itself takes no confirmation flag.
 */
export const getAccessRole = (id: AccessRoleId) =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_ACCESS);
    const roles = yield* AccessRoleRepository;
    const record = yield* roles.findById(id);
    if (Option.isNone(record)) return yield* new AccessRoleNotFound({ id });
    return yield* toAccessRoleView(record.value);
  });
