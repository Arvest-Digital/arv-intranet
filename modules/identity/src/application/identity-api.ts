import type { Actor, Unauthenticated } from '@arv/kernel';
import { Context, Effect, Layer, type Option } from 'effect';
import { PermissionCatalog, SessionRepository } from './ports';
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
  }
>() {}

export const IdentityApiLive = Layer.effect(
  IdentityApi,
  Effect.gen(function* () {
    const sessions = yield* SessionRepository;
    const catalog = yield* PermissionCatalog;
    return {
      resolveActor: (token) =>
        resolveActor(token).pipe(
          Effect.provideService(SessionRepository, sessions),
          Effect.provideService(PermissionCatalog, catalog),
        ),
    };
  }),
);
