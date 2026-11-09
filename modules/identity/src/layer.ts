import type { PermissionDeclaration } from '@arv/kernel';
import { Layer } from 'effect';
import { IdentityApiLive } from './application/identity-api';
import { PermissionCatalog } from './application/ports';
import { DrizzleAccessRoleRepositoryLive } from './infrastructure/drizzle-access-role-repository';
import { DrizzleSessionRepositoryLive } from './infrastructure/drizzle-session-repository';
import { DrizzleUserRepositoryLive } from './infrastructure/drizzle-user-repository';
import { GoogleSignInLive, type GoogleSignInOptions } from './infrastructure/google-sign-in';

export { IdentityConfig, PermissionCatalog } from './application/ports';
export type { GoogleSignInOptions } from './infrastructure/google-sign-in';

export interface IdentityModuleOptions {
  /** Google's client secret and transport options; the secret lives only in the api (ADR-0007). */
  readonly google: GoogleSignInOptions;
}

const RepositoriesLive = Layer.mergeAll(
  DrizzleUserRepositoryLive,
  DrizzleSessionRepositoryLive,
  DrizzleAccessRoleRepositoryLive,
);

/**
 * Everything the identity module provides: the facade, its Drizzle repositories and the Google
 * adapter. Requires `Database`, plus `PermissionCatalog` and `IdentityConfig`, which only the host
 * can build (every module's declarations; the api's env). The host also provides `UnitOfWork`.
 */
export const IdentityModuleLive = (options: IdentityModuleOptions) =>
  Layer.merge(IdentityApiLive, GoogleSignInLive(options.google)).pipe(
    Layer.provideMerge(RepositoriesLive),
  );

/** The catalog over every module's declarations, as the host collects them (ADR-0004). */
export const permissionCatalogLayer = (declarations: ReadonlyArray<PermissionDeclaration>) => {
  const all = [...declarations];
  const keys = new Set<string>(all.map((declaration) => declaration.key));
  return Layer.succeed(PermissionCatalog, {
    declarations: () => all,
    isDeclared: (key) => keys.has(key),
  });
};
