import { Schema } from 'effect';
import { AdminContact, PermissionKey } from './values';

/** Every `identity.*` error code the contract advertises (OpenAPI `ApiError.code`). */
export const IdentityErrorCode = Schema.Literal(
  'identity.access_removed',
  'identity.missing_permission',
  'identity.sign_in_refused',
  'identity.not_on_access_list',
  'identity.email_not_company_domain',
  'identity.email_taken',
  'identity.user_not_found',
  'identity.access_role_not_found',
  'identity.duplicate_access_role_name',
  'identity.retired_permission',
  'identity.last_admin_required',
);
export type IdentityErrorCode = typeof IdentityErrorCode.Type;

/** The same codes as constants, so presenters and web never spell a code by hand. */
export const IdentityErrorCodes = {
  accessRemoved: 'identity.access_removed',
  missingPermission: 'identity.missing_permission',
  signInRefused: 'identity.sign_in_refused',
  notOnAccessList: 'identity.not_on_access_list',
  emailNotCompanyDomain: 'identity.email_not_company_domain',
  emailTaken: 'identity.email_taken',
  userNotFound: 'identity.user_not_found',
  accessRoleNotFound: 'identity.access_role_not_found',
  duplicateAccessRoleName: 'identity.duplicate_access_role_name',
  retiredPermission: 'identity.retired_permission',
  lastAdminRequired: 'identity.last_admin_required',
} as const satisfies Record<string, IdentityErrorCode>;

/**
 * `details` of `identity.email_not_company_domain` (AC-05) and `identity.retired_permission`
 * (AC-16): the broken rules and, for a retired permission, the keys no module declares.
 */
export const RuleViolations = Schema.Struct({
  rules: Schema.NonEmptyArray(Schema.Literal('not_company_domain', 'retired_permission')),
  permissionKeys: Schema.optional(Schema.Array(PermissionKey)),
});
export type RuleViolations = typeof RuleViolations.Type;

/** `details` of `identity.missing_permission` (AC-08). */
export const MissingPermissions = Schema.Struct({
  missingPermissions: Schema.NonEmptyArray(PermissionKey),
});
export type MissingPermissions = typeof MissingPermissions.Type;

/** `details` of `identity.not_on_access_list` (AC-03). Empty `admins` = «ask your manager». */
export const NotOnAccessListDetails = Schema.Struct({
  admins: Schema.Array(AdminContact),
});
export type NotOnAccessListDetails = typeof NotOnAccessListDetails.Type;
