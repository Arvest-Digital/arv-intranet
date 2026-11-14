import { Actor, CurrentActor, Unauthenticated } from '@arv/kernel';
import { Effect, Option } from 'effect';
import type { User } from '../domain/user';
import { UserRepository } from './ports';

type SignedInActor = Extract<Actor, { readonly _tag: 'User' }>;

/** The signed-in actor; an anonymous one fails `Unauthenticated` (401). */
export const requireSignedIn: Effect.Effect<SignedInActor, Unauthenticated, CurrentActor> =
  Effect.flatMap(
    CurrentActor,
    Actor.$match({
      Anonymous: () => Effect.fail(new Unauthenticated({})),
      User: (user) => Effect.succeed(user),
    }),
  );

/** Who is signed in and the declared permission keys they hold now (getMe). */
export interface MeView {
  readonly user: User;
  readonly permissions: ReadonlyArray<string>;
}

/**
 * The actor's user and the permissions resolved for this request (Critical flow 2); web uses
 * them for navigation. A user removed since the actor was built is treated as signed out.
 */
export const getMe = Effect.gen(function* () {
  const actor = yield* requireSignedIn;
  const users = yield* UserRepository;
  const user = yield* users.findById(actor.id);
  if (Option.isNone(user)) return yield* new Unauthenticated({});
  return { user: user.value, permissions: [...actor.permissions] } satisfies MeView;
});
