import { Schema } from 'effect';
import {
  AccessRoleName,
  PermissionDeclaration,
  PermissionKey,
  strict,
  UniqueArray,
} from './values';

/** `getAccessRole`, `createAccessRole`, `updateAccessRole` 200/201 and the items of a page. */
export const AccessRole = Schema.Struct({
  id: Schema.UUID,
  name: AccessRoleName,
  /** Ticked by default when adding someone (AC-13). */
  isPreselected: Schema.Boolean,
  /** Users holding it (AC-11 delete warning). */
  holderCount: Schema.NonNegativeInt,
  /** Granted keys that a module declares, in plain words. */
  permissions: Schema.Array(PermissionDeclaration),
  /** Granted keys no module declares; non-empty = the role is flagged as retired (AC-16). */
  retiredPermissionKeys: Schema.Array(PermissionKey),
  createdAt: Schema.Date,
});
export type AccessRole = typeof AccessRole.Type;
export type AccessRoleEncoded = typeof AccessRole.Encoded;

/** True when the role still lists a permission no module declares (AC-16). */
export const isRetired = (role: Pick<AccessRole, 'retiredPermissionKeys'>): boolean =>
  role.retiredPermissionKeys.length > 0;

/** `listAccessRoles` 200: a cursor page of access roles. */
export const AccessRolePage = Schema.Struct({
  items: Schema.Array(AccessRole),
  hasNext: Schema.Boolean,
  hasPrev: Schema.Boolean,
  nextCursor: Schema.NullOr(Schema.UUID),
});
export type AccessRolePage = typeof AccessRolePage.Type;
export type AccessRolePageEncoded = typeof AccessRolePage.Encoded;

/** `createAccessRole` / `updateAccessRole` request body: the name and the full key set. */
export const AccessRoleInput = strict(
  Schema.Struct({
    name: AccessRoleName,
    permissionKeys: UniqueArray(PermissionKey),
  }),
);
export type AccessRoleInput = typeof AccessRoleInput.Type;

/** `setPreselectedAccessRole` body and 200 (AC-13): the marked role, or `null` for none. */
export const PreselectedAccessRole = strict(
  Schema.Struct({ accessRoleId: Schema.NullOr(Schema.UUID) }),
);
export type PreselectedAccessRole = typeof PreselectedAccessRole.Type;

/** `listPermissions` 200: every permission a module declares now (ADR-0004). */
export const PermissionCatalog = Schema.Struct({
  items: Schema.Array(PermissionDeclaration),
});
export type PermissionCatalog = typeof PermissionCatalog.Type;

/** `accessRoleId` path parameter. */
export const AccessRoleIdPath = Schema.Struct({ accessRoleId: Schema.UUID });
