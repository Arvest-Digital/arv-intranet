import {
  Actor,
  CurrentActor,
  type Permission,
  PermissionDenied,
  Unauthenticated,
} from '@arv/kernel';
import { Effect } from 'effect';

/**
 * The signed-in actor's permissions; an anonymous actor fails `Unauthenticated` (401). For reads
 * whose answer depends on more than one permission (the list's leave projects, AC-29).
 */
export const actorPermissions: Effect.Effect<
  ReadonlySet<Permission>,
  Unauthenticated,
  CurrentActor
> = Effect.flatMap(
  CurrentActor,
  Actor.$match({
    Anonymous: () => Effect.fail(new Unauthenticated({})),
    User: ({ permissions }) => Effect.succeed(permissions),
  }),
);

/**
 * Succeeds with the actor's permissions when they hold at least one of `permissions` (a read
 * several roles share). Refusal names the first, which is projects' own, so the answer is
 * `projects.missing_permission`. Deny by default, like the kernel's `requirePermission`.
 */
export const requireAnyPermission = (
  permissions: readonly [Permission, ...ReadonlyArray<Permission>],
): Effect.Effect<ReadonlySet<Permission>, PermissionDenied | Unauthenticated, CurrentActor> =>
  Effect.flatMap(actorPermissions, (held) =>
    permissions.some((permission) => held.has(permission))
      ? Effect.succeed(held)
      : Effect.fail(new PermissionDenied({ permission: permissions[0] })),
  );
