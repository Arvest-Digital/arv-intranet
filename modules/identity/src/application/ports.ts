import type { UserId } from '@arv/kernel';
import { Context, type Effect, type Option } from 'effect';
import type { NewUser, User } from '../domain/user';

/** Outbound port for users. Database failures are defects, so there is no error channel. */
export class UserRepository extends Context.Tag('identity/UserRepository')<
  UserRepository,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<User>>;
    readonly findById: (id: UserId) => Effect.Effect<Option.Option<User>>;
    readonly findByEmail: (email: string) => Effect.Effect<Option.Option<User>>;
    readonly create: (input: NewUser) => Effect.Effect<User>;
  }
>() {}
