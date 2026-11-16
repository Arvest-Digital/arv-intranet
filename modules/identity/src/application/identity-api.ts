import type { Actor, Unauthenticated, UserId } from '@arv/kernel';
import { Context, Effect, Layer, Option } from 'effect';
import { PermissionCatalog, SessionRepository, UserRepository } from './ports';
import { resolveActor } from './resolve-actor';

/** Facade other modules and the host use. Add a method only when someone outside needs it. */
export class IdentityApi extends Context.Tag('identity/IdentityApi')<
  IdentityApi,
  {
    /**
     * Builds the request's actor from its bearer token, uncached (ADR-0005). No, unknown or
     * expired token → `Anonymous`; revoked → `Unauthenticated { reason: 'access-removed' }`.
     * A database failure is a defect, never `Anonymous` (fail closed).
     */
    readonly resolveActor: (token: Option.Option<string>) => Effect.Effect<Actor, Unauthenticated>;
    /** True when the login is on the access list (org links employee records to it, flow 9). */
    readonly userExists: (id: UserId) => Effect.Effect<boolean>;
  }
>() {}

export const IdentityApiLive = Layer.effect(
  IdentityApi,
  Effect.gen(function* () {
    const sessions = yield* SessionRepository;
    const catalog = yield* PermissionCatalog;
    const users = yield* UserRepository;
    return {
      resolveActor: (token) =>
        resolveActor(token).pipe(
          Effect.provideService(SessionRepository, sessions),
          Effect.provideService(PermissionCatalog, catalog),
        ),
      userExists: (id) => users.findById(id).pipe(Effect.map(Option.isSome)),
    };
  }),
);
