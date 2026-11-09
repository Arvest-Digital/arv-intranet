import { requirePermission } from '@arv/kernel';
import { Effect } from 'effect';
import { MANAGE_ACCESS } from '../permissions';
import { PermissionCatalog } from './ports';

/** Flow 6, first step (AC-09): every permission a module declares now, in plain words (ADR-0004). */
export const listPermissions = () =>
  Effect.gen(function* () {
    yield* requirePermission(MANAGE_ACCESS);
    const catalog = yield* PermissionCatalog;
    return catalog.declarations();
  });
