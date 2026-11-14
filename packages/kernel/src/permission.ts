import { Data, Effect, Schema } from 'effect';
import { Actor, CurrentActor } from './actor';

/**
 * A named permission, `<module>:<kebab-action>` (e.g. `identity:manage-access`). Each module
 * declares the permissions it checks; the host collects the declarations into one catalog.
 */
export const Permission = Schema.String.pipe(
  Schema.pattern(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*:[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
  Schema.brand('Permission'),
);
export type Permission = typeof Permission.Type;

/** How a module declares a permission it checks (ADR-0004). */
export interface PermissionDeclaration {
  readonly key: Permission;
  readonly name: string;
  readonly description: string;
  readonly feature: string;
}

/** The actor is signed in but does not hold `permission`. */
export class PermissionDenied extends Data.TaggedError('PermissionDenied')<{
  readonly permission: Permission;
}> {}

/** No signed-in actor. `reason: 'access-removed'` when the session ended because access was removed. */
export class Unauthenticated extends Data.TaggedError('Unauthenticated')<{
  readonly reason?: 'access-removed';
}> {}

/**
 * The one access check every use case runs: succeeds only when the current actor is a user
 * holding `permission`. Deny by default — a key nobody holds is refused for everyone.
 */
export const requirePermission = (
  permission: Permission,
): Effect.Effect<void, PermissionDenied | Unauthenticated, CurrentActor> =>
  Effect.flatMap(
    CurrentActor,
    Actor.$match({
      Anonymous: () => Effect.fail(new Unauthenticated({})),
      User: ({ permissions }) =>
        permissions.has(permission)
          ? Effect.void
          : Effect.fail(new PermissionDenied({ permission })),
    }),
  );
