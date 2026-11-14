import { Schema } from 'effect';

export class UserNotFound extends Schema.TaggedError<UserNotFound>()('UserNotFound', {
  id: Schema.String,
}) {}

export class EmailTaken extends Schema.TaggedError<EmailTaken>()('EmailTaken', {
  email: Schema.String,
}) {}

export class LastAdminRequired extends Schema.TaggedError<LastAdminRequired>()(
  'LastAdminRequired',
  {},
) {}

/** The address is invalid, too long, or not on the company domain (AC-05). */
export class NotCompanyAddress extends Schema.TaggedError<NotCompanyAddress>()(
  'NotCompanyAddress',
  { email: Schema.String },
) {}

/** Another access role already has the same name key, ignoring case and surrounding spaces (AC-10). */
export class AccessRoleNameTaken extends Schema.TaggedError<AccessRoleNameTaken>()(
  'AccessRoleNameTaken',
  { name: Schema.String },
) {}

export class AccessRoleNotFound extends Schema.TaggedError<AccessRoleNotFound>()(
  'AccessRoleNotFound',
  { id: Schema.String },
) {}

/** A role may keep a retired (undeclared) permission key, but never gain one (AC-16). */
export class RetiredPermissionNotAssignable extends Schema.TaggedError<RetiredPermissionNotAssignable>()(
  'RetiredPermissionNotAssignable',
  { keys: Schema.Array(Schema.String) },
) {}
