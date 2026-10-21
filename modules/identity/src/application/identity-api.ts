import { Actor } from '@arv/kernel';
import { Context, Effect, Layer, type Option } from 'effect';

/** Facade other modules and the host use. Add a method only when someone outside needs it. */
export class IdentityApi extends Context.Tag('identity/IdentityApi')<
  IdentityApi,
  {
    /** Builds the request's actor from its bearer token. */
    readonly resolveActor: (token: Option.Option<string>) => Effect.Effect<Actor>;
  }
>() {}

export const IdentityApiLive = Layer.succeed(IdentityApi, {
  // The authentication source (Access JWT, SSO or own sessions) is still an open decision
  // (docs/adr/0001-modular-monolith.md). Until then every request is anonymous and the token is
  // not read, so no request can gain privileges.
  resolveActor: () => Effect.succeed(Actor.Anonymous()),
});
