import {
  Actor,
  CurrentActor,
  type Permission,
  PermissionDenied,
  Unauthenticated,
  type UserId,
} from '@arv/kernel';
import { Effect } from 'effect';

/** Succeeds for any signed-in user; an anonymous actor fails `Unauthenticated` (401). */
export const requireSignedIn: Effect.Effect<UserId, Unauthenticated, CurrentActor> = Effect.flatMap(
  CurrentActor,
  Actor.$match({
    Anonymous: () => Effect.fail(new Unauthenticated({})),
    User: ({ id }) => Effect.succeed(id),
  }),
);

/**
 * Succeeds when the signed-in actor holds at least one of `permissions` (a read several roles
 * share, api-sync-report D-5). Refusal names the first, which is org's own, so the answer is
 * `org.missing_permission`. Deny by default, like the kernel's `requirePermission`.
 */
export const requireAnyPermission = (
  permissions: readonly [Permission, ...ReadonlyArray<Permission>],
): Effect.Effect<void, PermissionDenied | Unauthenticated, CurrentActor> =>
  Effect.flatMap(
    CurrentActor,
    Actor.$match({
      Anonymous: () => Effect.fail(new Unauthenticated({})),
      User: ({ permissions: held }) =>
        permissions.some((permission) => held.has(permission))
          ? Effect.void
          : Effect.fail(new PermissionDenied({ permission: permissions[0] })),
    }),
  );
