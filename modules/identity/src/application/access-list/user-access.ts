import type { PermissionDeclaration, UserId } from '@arv/kernel';
import { Effect, Option } from 'effect';
import { AccessRoleNotFound, UserNotFound } from '../../domain/errors';
import type { User } from '../../domain/user';
import {
  type AccessRoleId,
  AccessRoleRepository,
  PermissionCatalog,
  UserRepository,
} from '../ports';

/** An access role as referenced from a user. */
export interface AccessRoleRef {
  readonly id: AccessRoleId;
  readonly name: string;
}

/** A user on the access list with the roles they hold and what those roles grant together. */
export interface UserAccess {
  readonly user: User;
  readonly accessRoles: ReadonlyArray<AccessRoleRef>;
  /** Union of the roles' keys, declared keys only, in catalog order (AC-12, AC-16). */
  readonly combinedPermissions: ReadonlyArray<PermissionDeclaration>;
}

/** Reads the user's roles and labels their combined permissions from the catalog. */
export const describeUser = (user: User) =>
  Effect.gen(function* () {
    const accessRoles = yield* AccessRoleRepository;
    const catalog = yield* PermissionCatalog;
    const roles = yield* accessRoles.listForUser(user.id);
    const granted = new Set(roles.flatMap((role) => role.permissionKeys));
    const access: UserAccess = {
      user,
      accessRoles: roles.map(({ id, name }) => ({ id, name })),
      combinedPermissions: catalog.declarations().filter((d) => granted.has(d.key)),
    };
    return access;
  });

/** The user on the access list, or `UserNotFound`. */
export const findUser = (id: UserId) =>
  Effect.flatMap(UserRepository, (users) => users.findById(id)).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new UserNotFound({ id })),
        onSome: Effect.succeed,
      }),
    ),
  );

/** De-duplicates `ids` and fails `AccessRoleNotFound` with the first one that does not exist. */
export const requireAccessRoles = (ids: ReadonlyArray<AccessRoleId>) =>
  Effect.gen(function* () {
    const accessRoles = yield* AccessRoleRepository;
    const unique = [...new Set(ids)];
    for (const id of unique) {
      if (Option.isNone(yield* accessRoles.findById(id))) {
        return yield* new AccessRoleNotFound({ id });
      }
    }
    return unique;
  });
