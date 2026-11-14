import { Schema } from 'effect';
import {
  AccessRoleIds,
  AccessRoleRef,
  Email,
  PermissionDeclaration,
  strict,
  UserName,
} from './values';

/**
 * A user on the access list with their access roles and combined permissions (OpenAPI `User`;
 * `getUser`, `createUser`, `renameUser`, `setUserAccessRoles`).
 */
export const UserWithAccessRoles = Schema.Struct({
  id: Schema.UUID,
  email: Email,
  name: UserName,
  accessRoles: Schema.Array(AccessRoleRef),
  /** Union of what the roles grant, declared keys only, in plain words (AC-12). */
  combinedPermissions: Schema.Array(PermissionDeclaration),
  createdAt: Schema.Date,
});
export type UserWithAccessRoles = typeof UserWithAccessRoles.Type;
export type UserWithAccessRolesEncoded = typeof UserWithAccessRoles.Encoded;

/** `listUsers` 200: a cursor page of the access list. */
export const UserPage = Schema.Struct({
  items: Schema.Array(UserWithAccessRoles),
  hasNext: Schema.Boolean,
  hasPrev: Schema.Boolean,
  nextCursor: Schema.NullOr(Schema.UUID),
});
export type UserPage = typeof UserPage.Type;
export type UserPageEncoded = typeof UserPage.Encoded;

/** `createUser` request body (AC-04, AC-13): `accessRoleIds` is what the admin left ticked. */
export const UserCreate = strict(
  Schema.Struct({
    email: Email,
    name: UserName,
    accessRoleIds: AccessRoleIds,
  }),
);
export type UserCreate = typeof UserCreate.Type;

/** `renameUser` request body (AC-21). Only the name; a body carrying `email` is rejected. */
export const UserChange = strict(Schema.Struct({ name: UserName }));
export type UserChange = typeof UserChange.Type;

/** `setUserAccessRoles` request body (AC-12): the exact set of roles to hold, empty allowed. */
export const UserAccessRolesChange = strict(Schema.Struct({ accessRoleIds: AccessRoleIds }));
export type UserAccessRolesChange = typeof UserAccessRolesChange.Type;

/** `userId` path parameter. */
export const UserIdPath = Schema.Struct({ userId: Schema.UUID });

/** Page size bounds of `listUsers` and `listAccessRoles` (OpenAPI `Limit`; the server defaults to 50). */
export const PAGE_LIMIT_MAX = 100;

/**
 * `listUsers` query (OpenAPI `After`, `Before`, `Limit`): the page after or before an id seen,
 * never both. `limit` arrives as a query string.
 */
export const PageQuery = Schema.Struct({
  after: Schema.optional(Schema.UUID),
  before: Schema.optional(Schema.UUID),
  limit: Schema.optional(
    Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, PAGE_LIMIT_MAX)),
  ),
}).pipe(
  Schema.filter((query) => query.after === undefined || query.before === undefined, {
    message: () => 'Use either after or before, not both',
  }),
);
export type PageQuery = typeof PageQuery.Type;
