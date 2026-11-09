import type { Permission } from '@arv/kernel';
import { type Brand, Either, Schema } from 'effect';
import { RetiredPermissionNotAssignable } from './errors';

export const ACCESS_ROLE_NAME_MAX_LENGTH = 100;

/** The display form of a role name: trimmed, non-empty, at most 100 characters. Decoding trims. */
export const AccessRoleName = Schema.Trim.pipe(
  Schema.compose(
    Schema.String.pipe(
      Schema.nonEmptyString(),
      Schema.maxLength(ACCESS_ROLE_NAME_MAX_LENGTH),
      Schema.brand('AccessRoleName'),
    ),
  ),
);
export type AccessRoleName = typeof AccessRoleName.Type;

/** What role names are unique on: `lower(trim(name))` (AC-10). */
export type AccessRoleNameKey = string & Brand.Brand<'AccessRoleNameKey'>;

/** `'Planner'` and `' planner '` share the key `'planner'`. */
export const accessRoleNameKey = (name: string): AccessRoleNameKey =>
  name.trim().toLowerCase() as AccessRoleNameKey;

/** A role's granted keys, split against the declared catalog. Retired keys grant nothing (AC-16). */
export interface RoleGrants {
  readonly active: ReadonlyArray<Permission>;
  readonly retired: ReadonlyArray<string>;
}

/** Splits `granted` into keys some module declares (active) and keys none does (retired). */
export const splitGrants = (
  granted: Iterable<string>,
  declared: ReadonlySet<string>,
): RoleGrants => {
  const active: Permission[] = [];
  const retired: string[] = [];
  for (const key of new Set(granted)) {
    if (declared.has(key)) active.push(key as Permission);
    else retired.push(key);
  }
  return { active, retired };
};

/**
 * Replaces a role's grants `current` with `next`. Any key in `next` is allowed if it is declared
 * or already granted (a retired key may be kept, but only removed from here on); a newly added
 * undeclared key is refused with `RetiredPermissionNotAssignable` (Flow 6, Flow 10, AC-16).
 */
export const changeGrants = (
  current: Iterable<string>,
  next: Iterable<string>,
  declared: ReadonlySet<string>,
): Either.Either<ReadonlySet<string>, RetiredPermissionNotAssignable> => {
  const kept = new Set(current);
  const result = new Set(next);
  const refused = [...result].filter((key) => !declared.has(key) && !kept.has(key));
  return refused.length > 0
    ? Either.left(new RetiredPermissionNotAssignable({ keys: refused }))
    : Either.right(result);
};
