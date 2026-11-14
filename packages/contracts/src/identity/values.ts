import { Schema } from 'effect';

/**
 * Reject keys the struct does not declare (OpenAPI `additionalProperties: false`). Used on request
 * bodies, e.g. so a rename carrying `email` fails validation instead of being silently dropped.
 */
export const strict = <S extends Schema.Schema.Any>(schema: S): S =>
  schema.annotations({ parseOptions: { onExcessProperty: 'error' } }) as S;

/** An array whose items are pairwise distinct (OpenAPI `uniqueItems: true`, primitive items only). */
export const UniqueArray = <S extends Schema.Schema<string, string>>(item: S) =>
  Schema.Array(item).pipe(
    Schema.filter((items) => new Set(items).size === items.length, {
      message: () => 'Items must be unique',
    }),
  );

/**
 * A syntactically valid address of at most 254 characters. Lower-casing, trimming and the
 * company-domain check (AC-05, AC-06) are the server's job, not the contract's.
 */
export const Email = Schema.String.pipe(
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: () => 'Invalid email address' }),
  Schema.maxLength(254),
);

/** Trimmed, non-empty, at most 100 characters (AC-04, AC-21). */
export const UserName = Schema.NonEmptyTrimmedString.pipe(Schema.maxLength(100));

/** Trimmed, non-empty, at most 100 characters; unique ignoring case and surrounding spaces (AC-10). */
export const AccessRoleName = Schema.NonEmptyTrimmedString.pipe(Schema.maxLength(100));

/** `<module>:<kebab-action>`, e.g. `identity:manage-access` (SAD §8). */
export const PermissionKey = Schema.String.pipe(
  Schema.pattern(/^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/, {
    message: () => 'Expected <module>:<kebab-action>',
  }),
  Schema.maxLength(100),
);
export type PermissionKey = typeof PermissionKey.Type;

/** One declared permission (ADR-0004), in plain words for admins (US-04). */
export const PermissionDeclaration = Schema.Struct({
  key: PermissionKey,
  name: Schema.String,
  description: Schema.String,
  feature: Schema.String,
});
export type PermissionDeclaration = typeof PermissionDeclaration.Type;

/** An access role as referenced from a user. */
export const AccessRoleRef = Schema.Struct({
  id: Schema.UUID,
  name: AccessRoleName,
});
export type AccessRoleRef = typeof AccessRoleRef.Type;

/** An admin to ask for access (AC-03). */
export const AdminContact = Schema.Struct({
  name: UserName,
  email: Email,
});
export type AdminContact = typeof AdminContact.Type;

/** The roles held, zero or more (a set). */
export const AccessRoleIds = UniqueArray(Schema.UUID);
