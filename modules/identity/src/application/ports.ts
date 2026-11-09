import type { PermissionDeclaration, UserId } from '@arv/kernel';
import { Context, type Effect, type Option, Schema } from 'effect';
import type { AccessRoleName, AccessRoleNameKey } from '../domain/access-role';
import type { AccessRoleNameTaken, EmailTaken } from '../domain/errors';
import type { RevocationReason, SessionTokenHash, StoredSession } from '../domain/session';
import type { SignInClaims } from '../domain/sign-in-eligibility';
import type { NewUser, User, UserName } from '../domain/user';

// Every repository port has no database error channel: adapters turn DB failures into defects
// (`Effect.orDie`), which is how identity fails closed. All of them join an open `UnitOfWork`.

/** An access role's id (UUIDv7 from Postgres). Local to identity. */
export const AccessRoleId = Schema.UUID.pipe(Schema.brand('AccessRoleId'));
export type AccessRoleId = typeof AccessRoleId.Type;

/** Users on the access list and the access roles they hold. */
export class UserRepository extends Context.Tag('identity/UserRepository')<
  UserRepository,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<User>>;
    readonly findById: (id: UserId) => Effect.Effect<Option.Option<User>>;
    /** `email` must already be normalised (lower-cased, trimmed). */
    readonly findByEmail: (email: string) => Effect.Effect<Option.Option<User>>;
    /** Inserts the user holding `accessRoleIds`. A duplicate email fails `EmailTaken` (AC-06). */
    readonly create: (
      input: NewUser,
      accessRoleIds?: ReadonlyArray<AccessRoleId>,
    ) => Effect.Effect<User, EmailTaken>;
    /** Changes only the name (AC-21); `None` when the user is not on the list. */
    readonly rename: (id: UserId, name: UserName) => Effect.Effect<Option.Option<User>>;
    /** Removes the user and their assignments; `false` when there was no such user. */
    readonly delete: (id: UserId) => Effect.Effect<boolean>;
    /** The ids of the access roles the user holds. */
    readonly accessRoleIds: (id: UserId) => Effect.Effect<ReadonlyArray<AccessRoleId>>;
    /** Replaces the set of access roles the user holds (AC-12). */
    readonly setAccessRoles: (
      id: UserId,
      accessRoleIds: ReadonlyArray<AccessRoleId>,
    ) => Effect.Effect<void>;
  }
>() {}

/** A session row as read by its token hash, with the keys its user's roles grant. */
export interface ResolvedSession extends StoredSession {
  /** `null` once the user was removed (the revoked row survives, AC-07). */
  readonly userId: UserId | null;
  /** The union of keys over the user's access roles, declared or not (AC-12). */
  readonly grantedKeys: ReadonlyArray<string>;
}

/** Server-side sign-in sessions (ADR-0003). Only the token's hash is ever stored. */
export class SessionRepository extends Context.Tag('identity/SessionRepository')<
  SessionRepository,
  {
    readonly create: (session: {
      readonly tokenHash: SessionTokenHash;
      readonly userId: UserId;
      readonly expiresAt: Date;
    }) => Effect.Effect<void>;
    /** One round-trip: session → user → roles → granted keys (QG-2). `None` for an unknown hash. */
    readonly resolve: (
      tokenHash: SessionTokenHash,
    ) => Effect.Effect<Option.Option<ResolvedSession>>;
    /** Removes this session only (AC-20); `false` when there was none. */
    readonly deleteByHash: (tokenHash: SessionTokenHash) => Effect.Effect<boolean>;
    /** Ends every session of the user early, keeping the rows so the reason can be shown (AC-07). */
    readonly revokeAllForUser: (userId: UserId, reason: RevocationReason) => Effect.Effect<void>;
    /** Lazy purge: deletes sessions whose expiry has passed. */
    readonly purgeExpired: () => Effect.Effect<void>;
  }
>() {}

/** An access role as stored: display name, granted keys (some may be retired) and holders. */
export interface AccessRoleRecord {
  readonly id: AccessRoleId;
  readonly name: string;
  readonly isPreselected: boolean;
  /** Stored keys, declared or not; compare with the `PermissionCatalog` to flag retired ones. */
  readonly permissionKeys: ReadonlyArray<string>;
  readonly holderCount: number;
  readonly createdAt: Date;
}

/** What an access role is created or replaced from. */
export interface AccessRoleInput {
  readonly name: AccessRoleName;
  readonly permissionKeys: ReadonlyArray<string>;
}

/** An admin as shown on the «not set up yet» screen: name and email only (AC-03). */
export interface AdminContact {
  readonly name: string;
  readonly email: string;
}

/** Access roles, their grants and the pre-selected mark. */
export class AccessRoleRepository extends Context.Tag('identity/AccessRoleRepository')<
  AccessRoleRepository,
  {
    readonly list: () => Effect.Effect<ReadonlyArray<AccessRoleRecord>>;
    readonly findById: (id: AccessRoleId) => Effect.Effect<Option.Option<AccessRoleRecord>>;
    readonly findByNameKey: (
      key: AccessRoleNameKey,
    ) => Effect.Effect<Option.Option<AccessRoleRecord>>;
    /** The roles the user holds. */
    readonly listForUser: (userId: UserId) => Effect.Effect<ReadonlyArray<AccessRoleRecord>>;
    /** A new role, not pre-selected. A taken name key fails `AccessRoleNameTaken` (AC-10). */
    readonly create: (
      input: AccessRoleInput,
    ) => Effect.Effect<AccessRoleRecord, AccessRoleNameTaken>;
    /** Replaces name and key set; `None` when the role is gone. */
    readonly update: (
      id: AccessRoleId,
      input: AccessRoleInput,
    ) => Effect.Effect<Option.Option<AccessRoleRecord>, AccessRoleNameTaken>;
    /** Deletes the role, its grants and assignments (and so its pre-selected mark); `false` if gone. */
    readonly delete: (id: AccessRoleId) => Effect.Effect<boolean>;
    /** Marks `id` as the only pre-selected role, or clears the mark with `null` (AC-13). */
    readonly setPreselected: (id: AccessRoleId | null) => Effect.Effect<void>;
    readonly getPreselected: () => Effect.Effect<Option.Option<AccessRoleRecord>>;
    /** Distinct users holding `identity:manage-access` through any of their roles (AC-14). */
    readonly countManageAccessHolders: () => Effect.Effect<number>;
    /** Users holding manage access, for the «not set up yet» screen (AC-03). */
    readonly listAdmins: () => Effect.Effect<ReadonlyArray<AdminContact>>;
    /** Finds «Admin» by name key or creates it, then adds manage access to it (AC-15). */
    readonly ensureAdminRole: () => Effect.Effect<AccessRoleRecord>;
  }
>() {}

/** Google refused the code (rejected, reused or expired). Carries nothing about the person. */
export class SignInRefused extends Schema.TaggedError<SignInRefused>()('SignInRefused', {}) {}

/** The server leg of Google OpenID Connect (ADR-0007). Google being unreachable is a defect. */
export class GoogleSignIn extends Context.Tag('identity/GoogleSignIn')<
  GoogleSignIn,
  {
    /** Google's sign-in address for this `state` and PKCE `codeChallenge` (S256). */
    readonly authorizationUrl: (state: string, codeChallenge: string) => Effect.Effect<string>;
    /** Exchanges the code; the ID token's issuer, audience, expiry and signature are checked. */
    readonly exchangeCode: (
      code: string,
      codeVerifier: string,
    ) => Effect.Effect<SignInClaims, SignInRefused>;
  }
>() {}

/** Every permission currently declared by any module, collected by the host (ADR-0004). */
export class PermissionCatalog extends Context.Tag('identity/PermissionCatalog')<
  PermissionCatalog,
  {
    readonly declarations: () => ReadonlyArray<PermissionDeclaration>;
    /** `false` for a retired key: it grants nothing and cannot be added to a role (AC-16, AC-18). */
    readonly isDeclared: (key: string) => boolean;
  }
>() {}

/** Identity's configuration, read from the api's env by the host. */
export class IdentityConfig extends Context.Tag('identity/IdentityConfig')<
  IdentityConfig,
  {
    /** The company email domain, e.g. `arvest.digital`. */
    readonly companyDomain: string;
    /** `FIRST_ADMIN_EMAIL`; empty means no first admin is configured (AC-15). */
    readonly firstAdminEmail: string;
    /** Google's `redirect_uri`: the web's sign-in return page. */
    readonly signInReturnUrl: string;
    readonly googleClientId: string;
  }
>() {}
