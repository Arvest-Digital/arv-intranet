import { DatabaseLive } from '@arv/db';
import { Layer } from 'effect';
import type { Bindings } from './env';
import { UserRepoLive } from './repositories/user-repo';
import { UserService, UserServiceLive } from './services/user-service';

/** Everything route handlers may depend on. Add new services here. */
export type AppServices = UserService;

/** Built per request: Workers bindings and connections are request-scoped. */
export const makeAppLayer = (env: Bindings): Layer.Layer<AppServices> =>
  UserServiceLive.pipe(
    Layer.provide(UserRepoLive),
    Layer.provide(DatabaseLive(env.HYPERDRIVE.connectionString)),
  );

export { UserService };
