import { Layer } from 'effect';
import { IdentityApiLive } from './application/identity-api';
import { DrizzleUserRepositoryLive } from './infrastructure/drizzle-user-repository';

/** Everything the identity module provides. Requires `Database`. */
export const IdentityModuleLive = Layer.merge(IdentityApiLive, DrizzleUserRepositoryLive);
