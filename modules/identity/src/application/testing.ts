import { type PermissionDeclaration, UnitOfWork, UserId } from '@arv/kernel';
import { Clock, Effect, Exit, Layer, Option } from 'effect';
import { accessRoleNameKey } from '../domain/access-role';
import { AccessRoleNameTaken, EmailTaken } from '../domain/errors';
import type { RevocationReason, SessionTokenHash } from '../domain/session';
import type { SignInClaims } from '../domain/sign-in-eligibility';
import { User } from '../domain/user';
import { identityPermissions, MANAGE_ACCESS } from '../permissions';
import {
  AccessRoleId,
  type AccessRoleRecord,
  AccessRoleRepository,
  GoogleSignIn,
  IdentityConfig,
  PermissionCatalog,
  SessionRepository,
  SignInRefused,
  UserRepository,
} from './ports';

/**
 * In-memory fakes of every identity port, for use-case unit tests. All fakes share one store,
 * so a role change is seen by the next `SessionRepository.resolve`, and the fake `UnitOfWork`
 * restores the whole store when the wrapped effect fails (like a Postgres rollback).
 * Ids are deterministic (`…0001`, `…0002`, …); times come from `Clock`, so `TestClock` works.
 *
 *   const fakes = makeIdentityFakes();
 *   const admin = fakes.seedUser({ email: 'ann@arvest.digital', name: 'Ann' }, [adminRole.id]);
 *   await Effect.runPromise(useCase.pipe(Effect.provide(fakes.layer)));
 *
 * To make one method misbehave, provide `Layer.succeed(Port, { ...fakes.sessions, resolve })`.
 */

interface StoredRole {
  readonly id: AccessRoleId;
  name: string;
  isPreselected: boolean;
  permissionKeys: Set<string>;
  readonly createdAt: Date;
}

interface StoredSessionRow {
  userId: UserId | null;
  readonly expiresAt: Date;
  revokedReason: RevocationReason | null;
}

interface Store {
  users: Map<UserId, User>;
  userRoles: Map<UserId, Set<AccessRoleId>>;
  roles: Map<AccessRoleId, StoredRole>;
  sessions: Map<SessionTokenHash, StoredSessionRow>;
}

const cloneStore = (store: Store): Store => ({
  users: new Map(store.users),
  userRoles: new Map([...store.userRoles].map(([id, roles]) => [id, new Set(roles)])),
  roles: new Map(
    [...store.roles].map(([id, role]) => [
      id,
      { ...role, permissionKeys: new Set(role.permissionKeys) },
    ]),
  ),
  sessions: new Map([...store.sessions].map(([hash, row]) => [hash, { ...row }])),
});

export const fakeIdentityConfig: IdentityConfig['Type'] = {
  companyDomain: 'arvest.digital',
  firstAdminEmail: 'first.admin@arvest.digital',
  signInReturnUrl: 'https://intranet.test/sign-in/return',
  googleClientId: 'test-client-id.apps.googleusercontent.com',
};

export interface IdentityFakesOptions {
  /** The declared catalog to start with; defaults to identity's own declarations. */
  readonly declarations?: ReadonlyArray<PermissionDeclaration>;
  readonly config?: Partial<IdentityConfig['Type']>;
}

export const makeIdentityFakes = (options: IdentityFakesOptions = {}) => {
  let store: Store = {
    users: new Map(),
    userRoles: new Map(),
    roles: new Map(),
    sessions: new Map(),
  };
  let nextId = 1;
  let transactionDepth = 0;

  const declarations = new Map<string, PermissionDeclaration>(
    (options.declarations ?? identityPermissions).map((d) => [d.key, d]),
  );
  const googleClaims = new Map<string, SignInClaims>();
  const googleExchanges: Array<{ code: string; codeVerifier: string; inTransaction: boolean }> = [];
  let googleUnavailable = false;

  const config: IdentityConfig['Type'] = { ...fakeIdentityConfig, ...options.config };

  const newUuid = () => `00000000-0000-7000-8000-${String(nextId++).padStart(12, '0')}`;
  const now = Effect.map(Clock.currentTimeMillis, (ms) => new Date(ms));

  const rolesOf = (userId: UserId) => store.userRoles.get(userId) ?? new Set<AccessRoleId>();

  const toRecord = (role: StoredRole, from: Store = store): AccessRoleRecord => ({
    id: role.id,
    name: role.name,
    isPreselected: role.isPreselected,
    permissionKeys: [...role.permissionKeys],
    holderCount: [...from.userRoles.values()].filter((roles) => roles.has(role.id)).length,
    createdAt: role.createdAt,
  });

  const byNameKey = (name: string, except?: AccessRoleId) =>
    [...store.roles.values()].find(
      (role) => role.id !== except && accessRoleNameKey(role.name) === accessRoleNameKey(name),
    );

  const assertRolesExist = (ids: Iterable<AccessRoleId>) =>
    Effect.suspend(() => {
      const missing = [...ids].filter((id) => !store.roles.has(id));
      // The real adapter hits a foreign key: a defect, not a domain error.
      return missing.length > 0
        ? Effect.dieMessage(`fake: unknown access role ${missing.join(', ')}`)
        : Effect.void;
    });

  const isAdmin = (userId: UserId) =>
    [...rolesOf(userId)].some((id) => store.roles.get(id)?.permissionKeys.has(MANAGE_ACCESS));

  const insertRole = (name: string, permissionKeys: Iterable<string>, createdAt: Date) => {
    const role: StoredRole = {
      id: AccessRoleId.make(newUuid()),
      name,
      isPreselected: false,
      permissionKeys: new Set(permissionKeys),
      createdAt,
    };
    store.roles.set(role.id, role);
    return role;
  };

  const insertUser = (
    input: { readonly email: string; readonly name: string },
    roleIds: Iterable<AccessRoleId>,
    createdAt: Date,
  ) => {
    const user = new User({ ...input, id: UserId.make(newUuid()), createdAt });
    store.users.set(user.id, user);
    store.userRoles.set(user.id, new Set(roleIds));
    return user;
  };

  const users: UserRepository['Type'] = {
    list: () =>
      Effect.sync(() =>
        [...store.users.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      ),
    findById: (id) => Effect.sync(() => Option.fromNullable(store.users.get(id))),
    findByEmail: (email) =>
      Effect.sync(() =>
        Option.fromNullable([...store.users.values()].find((user) => user.email === email)),
      ),
    create: (input, accessRoleIds = []) =>
      Effect.gen(function* () {
        if ([...store.users.values()].some((user) => user.email === input.email)) {
          return yield* new EmailTaken({ email: input.email });
        }
        yield* assertRolesExist(accessRoleIds);
        return insertUser(input, accessRoleIds, yield* now);
      }),
    rename: (id, name) =>
      Effect.sync(() => {
        const user = store.users.get(id);
        if (user === undefined) return Option.none();
        const renamed = new User({ ...user, name });
        store.users.set(id, renamed);
        return Option.some(renamed);
      }),
    delete: (id) =>
      Effect.sync(() => {
        if (!store.users.delete(id)) return false;
        store.userRoles.delete(id);
        // ON DELETE SET NULL: revoked rows survive so the next request can say why (AC-07).
        for (const row of store.sessions.values()) if (row.userId === id) row.userId = null;
        return true;
      }),
    accessRoleIds: (id) => Effect.sync(() => [...rolesOf(id)]),
    setAccessRoles: (id, accessRoleIds) =>
      Effect.gen(function* () {
        yield* assertRolesExist(accessRoleIds);
        if (!store.users.has(id)) return yield* Effect.dieMessage(`fake: unknown user ${id}`);
        store.userRoles.set(id, new Set(accessRoleIds));
      }),
  };

  const sessions: SessionRepository['Type'] = {
    create: ({ tokenHash, userId, expiresAt }) =>
      Effect.suspend(() => {
        if (store.sessions.has(tokenHash)) {
          return Effect.dieMessage('fake: duplicate session token hash');
        }
        store.sessions.set(tokenHash, { userId, expiresAt, revokedReason: null });
        return Effect.void;
      }),
    resolve: (tokenHash) =>
      Effect.sync(() => {
        const row = store.sessions.get(tokenHash);
        if (row === undefined) return Option.none();
        const grantedKeys = new Set<string>();
        if (row.userId !== null) {
          for (const roleId of rolesOf(row.userId)) {
            for (const key of store.roles.get(roleId)?.permissionKeys ?? []) grantedKeys.add(key);
          }
        }
        return Option.some({
          userId: row.userId,
          expiresAt: row.expiresAt,
          revokedReason: row.revokedReason,
          grantedKeys: [...grantedKeys],
        });
      }),
    deleteByHash: (tokenHash) => Effect.sync(() => store.sessions.delete(tokenHash)),
    revokeAllForUser: (userId, reason) =>
      Effect.sync(() => {
        for (const row of store.sessions.values()) {
          if (row.userId === userId) row.revokedReason = reason;
        }
      }),
    purgeExpired: () =>
      Effect.map(now, (at) => {
        for (const [hash, row] of store.sessions) {
          if (row.expiresAt.getTime() <= at.getTime()) store.sessions.delete(hash);
        }
      }),
  };

  const accessRoles: AccessRoleRepository['Type'] = {
    list: () =>
      Effect.sync(() =>
        [...store.roles.values()]
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((role) => toRecord(role)),
      ),
    findById: (id) =>
      Effect.sync(() =>
        Option.fromNullable(store.roles.get(id)).pipe(Option.map((role) => toRecord(role))),
      ),
    findByNameKey: (key) =>
      Effect.sync(() =>
        Option.fromNullable(byNameKey(key)).pipe(Option.map((role) => toRecord(role))),
      ),
    listForUser: (userId) =>
      Effect.sync(() =>
        [...rolesOf(userId)].flatMap((id) => {
          const role = store.roles.get(id);
          return role === undefined ? [] : [toRecord(role)];
        }),
      ),
    create: (input) =>
      Effect.gen(function* () {
        if (byNameKey(input.name) !== undefined) {
          return yield* new AccessRoleNameTaken({ name: input.name });
        }
        return toRecord(insertRole(input.name, input.permissionKeys, yield* now));
      }),
    update: (id, input) =>
      Effect.gen(function* () {
        const role = store.roles.get(id);
        if (role === undefined) return Option.none();
        if (byNameKey(input.name, id) !== undefined) {
          return yield* new AccessRoleNameTaken({ name: input.name });
        }
        role.name = input.name;
        role.permissionKeys = new Set(input.permissionKeys);
        return Option.some(toRecord(role));
      }),
    delete: (id) =>
      Effect.sync(() => {
        if (!store.roles.delete(id)) return false;
        for (const roles of store.userRoles.values()) roles.delete(id);
        return true;
      }),
    setPreselected: (id) =>
      Effect.sync(() => {
        for (const role of store.roles.values()) role.isPreselected = role.id === id;
      }),
    getPreselected: () =>
      Effect.sync(() =>
        Option.fromNullable([...store.roles.values()].find((role) => role.isPreselected)).pipe(
          Option.map((role) => toRecord(role)),
        ),
      ),
    countManageAccessHolders: () =>
      Effect.sync(() => [...store.users.keys()].filter(isAdmin).length),
    listAdmins: () =>
      Effect.sync(() =>
        [...store.users.values()]
          .filter((user) => isAdmin(user.id))
          .map(({ name, email }) => ({ name, email })),
      ),
    ensureAdminRole: () =>
      Effect.gen(function* () {
        const role = byNameKey('Admin') ?? insertRole('Admin', [], yield* now);
        role.permissionKeys.add(MANAGE_ACCESS);
        return toRecord(role);
      }),
  };

  const google: GoogleSignIn['Type'] = {
    authorizationUrl: (state, codeChallenge) =>
      Effect.sync(() => {
        const url = new URL('https://accounts.google.test/o/oauth2/v2/auth');
        url.searchParams.set('state', state);
        url.searchParams.set('code_challenge', codeChallenge);
        url.searchParams.set('redirect_uri', config.signInReturnUrl);
        url.searchParams.set('hd', config.companyDomain);
        return url.toString();
      }),
    exchangeCode: (code, codeVerifier) =>
      Effect.suspend(() => {
        googleExchanges.push({ code, codeVerifier, inTransaction: transactionDepth > 0 });
        if (googleUnavailable) return Effect.dieMessage('fake: Google is unavailable');
        const claims = googleClaims.get(code);
        return claims === undefined ? Effect.fail(new SignInRefused()) : Effect.succeed(claims);
      }),
  };

  const catalog: PermissionCatalog['Type'] = {
    declarations: () => [...declarations.values()],
    isDeclared: (key) => declarations.has(key),
  };

  const unitOfWork: UnitOfWork['Type'] = {
    transactional: (effect) =>
      Effect.suspend(() => {
        // A nested call joins the outer unit, like `UnitOfWorkLive`.
        if (transactionDepth > 0) return effect;
        const snapshot = cloneStore(store);
        transactionDepth++;
        return effect.pipe(
          Effect.onExit((exit) =>
            Effect.sync(() => {
              transactionDepth--;
              if (Exit.isFailure(exit)) store = snapshot;
            }),
          ),
        );
      }),
  };

  const layer = Layer.mergeAll(
    Layer.succeed(UserRepository, users),
    Layer.succeed(SessionRepository, sessions),
    Layer.succeed(AccessRoleRepository, accessRoles),
    Layer.succeed(GoogleSignIn, google),
    Layer.succeed(PermissionCatalog, catalog),
    Layer.succeed(IdentityConfig, config),
    Layer.succeed(UnitOfWork, unitOfWork),
  );

  return {
    /** Every port plus `UnitOfWork`, backed by this fake's store. */
    layer,
    users,
    sessions,
    accessRoles,
    google,
    catalog,
    config,
    unitOfWork,

    /** Test setup, outside any effect. Dates default to the epoch so they never depend on now. */
    seedRole: (input: {
      readonly name: string;
      readonly permissionKeys?: ReadonlyArray<string>;
      readonly isPreselected?: boolean;
    }): AccessRoleRecord => {
      const role = insertRole(input.name, input.permissionKeys ?? [], new Date(0));
      if (input.isPreselected) {
        for (const other of store.roles.values()) other.isPreselected = other.id === role.id;
      }
      return toRecord(role);
    },
    seedUser: (
      input: { readonly email: string; readonly name: string },
      accessRoleIds: ReadonlyArray<AccessRoleId> = [],
    ): User => insertUser(input, accessRoleIds, new Date(0)),
    seedSession: (input: {
      readonly tokenHash: SessionTokenHash;
      readonly userId: UserId | null;
      readonly expiresAt: Date;
      readonly revokedReason?: RevocationReason | null;
    }): void => {
      store.sessions.set(input.tokenHash, {
        userId: input.userId,
        expiresAt: input.expiresAt,
        revokedReason: input.revokedReason ?? null,
      });
    },

    /** Adds (or re-declares) a permission in the catalog. */
    declare: (declaration: PermissionDeclaration): void => {
      declarations.set(declaration.key, declaration);
    },
    /** Removes a permission from the catalog, so roles that still hold it hold a retired key. */
    retire: (key: string): void => {
      declarations.delete(key);
    },

    /** The claims `exchangeCode(code, …)` returns; any other code is refused. */
    googleReturns: (code: string, claims: SignInClaims): void => {
      googleClaims.set(code, claims);
    },
    /** Makes `exchangeCode` die, as when Google's token endpoint is down. */
    googleDown: (): void => {
      googleUnavailable = true;
    },
    googleExchanges: (): ReadonlyArray<{
      readonly code: string;
      readonly codeVerifier: string;
      readonly inTransaction: boolean;
    }> => [...googleExchanges],

    /** Read-only views of the store, for assertions. */
    snapshot: () => {
      const copy = cloneStore(store);
      return {
        users: [...copy.users.values()],
        roles: [...copy.roles.values()].map((role) => toRecord(role, copy)),
        userRoles: (userId: UserId) => [...(copy.userRoles.get(userId) ?? [])],
        sessions: [...copy.sessions].map(([tokenHash, row]) => ({ tokenHash, ...row })),
      };
    },
    inTransaction: (): boolean => transactionDepth > 0,
  };
};

export type IdentityFakes = ReturnType<typeof makeIdentityFakes>;
