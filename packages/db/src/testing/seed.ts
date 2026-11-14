import { sql } from 'drizzle-orm';
import type { Executor } from '../database';

// Seeds the identity schema with raw SQL: @arv/db sits below the modules and can't import their tables.
// PII guard: defaults use `Test User <n>`, `user-<n>@example.test` and `Role <n>`, never real names or domains.

let counter = 0;
const next = () => {
  counter += 1;
  return counter;
};

// ---------------------------------------------------------------------------------------------
// identity.users

export type UserSeed = { id?: string; email: string; name: string; createdAt?: Date };
export type SeededUser = { id: string; email: string; name: string; createdAt: Date };

/** Tests run with `COMPANY_EMAIL_DOMAIN=example.test`, so the default email is a company email. */
export function makeUser(overrides: Partial<UserSeed> = {}): UserSeed {
  const n = next();
  return {
    email: `user-${n}@example.test`,
    name: `Test User ${n}`,
    ...overrides,
  };
}

export async function seedUsers(db: Executor, rows: ReadonlyArray<UserSeed>) {
  if (rows.length === 0) return [];
  const values = sql.join(
    rows.map(
      (row) => sql`(
        coalesce(${row.id ?? null}::uuid, uuidv7()),
        ${row.email},
        ${row.name},
        coalesce(${row.createdAt?.toISOString() ?? null}::timestamptz, now())
      )`,
    ),
    sql`, `,
  );
  const { rows: seeded } = await db.execute<SeededUser>(sql`
    INSERT INTO identity.users (id, email, name, created_at) VALUES ${values}
    RETURNING id, email, name, created_at AS "createdAt"
  `);
  return seeded;
}

// ---------------------------------------------------------------------------------------------
// identity.access_roles + identity.access_role_permissions

export type AccessRoleSeed = {
  id?: string;
  name: string;
  isPreselected: boolean;
  permissionKeys: ReadonlyArray<string>;
  createdAt?: Date;
};
export type SeededAccessRole = {
  id: string;
  name: string;
  isPreselected: boolean;
  permissionKeys: ReadonlyArray<string>;
  createdAt: Date;
};

export function makeAccessRole(overrides: Partial<AccessRoleSeed> = {}): AccessRoleSeed {
  return {
    name: `Role ${next()}`,
    isPreselected: false,
    permissionKeys: [],
    ...overrides,
  };
}

/** Inserts each role with its granted permission keys; returns them in input order. */
export async function seedAccessRoles(db: Executor, rows: ReadonlyArray<AccessRoleSeed>) {
  const seeded: SeededAccessRole[] = [];
  for (const row of rows) {
    const { rows: inserted } = await db.execute<Omit<SeededAccessRole, 'permissionKeys'>>(sql`
      INSERT INTO identity.access_roles (id, name, is_preselected, created_at) VALUES (
        coalesce(${row.id ?? null}::uuid, uuidv7()),
        ${row.name},
        ${row.isPreselected},
        coalesce(${row.createdAt?.toISOString() ?? null}::timestamptz, now())
      )
      RETURNING id, name, is_preselected AS "isPreselected", created_at AS "createdAt"
    `);
    const [role] = inserted;
    if (role === undefined) throw new Error('seedAccessRoles: INSERT returned no row');
    if (row.permissionKeys.length > 0) {
      const grants = sql.join(
        row.permissionKeys.map((key) => sql`(${role.id}::uuid, ${key})`),
        sql`, `,
      );
      await db.execute(sql`
        INSERT INTO identity.access_role_permissions (access_role_id, permission_key) VALUES ${grants}
      `);
    }
    seeded.push({ ...role, permissionKeys: [...row.permissionKeys] });
  }
  return seeded;
}

// ---------------------------------------------------------------------------------------------
// identity.user_access_roles

export type UserAccessRoleSeed = { userId: string; accessRoleId: string };

export async function seedUserAccessRoles(db: Executor, rows: ReadonlyArray<UserAccessRoleSeed>) {
  if (rows.length === 0) return;
  const values = sql.join(
    rows.map((row) => sql`(${row.userId}::uuid, ${row.accessRoleId}::uuid)`),
    sql`, `,
  );
  await db.execute(sql`
    INSERT INTO identity.user_access_roles (user_id, access_role_id) VALUES ${values}
  `);
}

// ---------------------------------------------------------------------------------------------
// identity.sessions
//
// Mirrors the identity domain (`modules/identity/src/domain/session.ts`): the token is 32 random
// bytes as base64url, Postgres stores only its SHA-256 as lower-case hex. Keep the two in step.

const SESSION_TOKEN_BYTES = 32;
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const randomSessionToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(SESSION_TOKEN_BYTES));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** SHA-256 of the raw token, lower-case hex: the value the session lookup compares against. */
export async function hashSessionToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type SessionSeed = {
  id?: string;
  /** `null` is a session whose user was deleted. */
  userId: string | null;
  token: string;
  /** Back-date it to seed an expired session. */
  expiresAt: Date;
  revokedReason: string | null;
  createdAt?: Date;
};
export type SeededSession = {
  id: string;
  /** The raw token, for `Authorization: Bearer <token>` or the session cookie. */
  token: string;
  tokenHash: string;
  userId: string | null;
  expiresAt: Date;
  revokedReason: string | null;
  createdAt: Date;
};

export function makeSession(
  overrides: Partial<SessionSeed> & Pick<SessionSeed, 'userId'>,
): SessionSeed {
  return {
    token: randomSessionToken(),
    expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
    revokedReason: null,
    ...overrides,
  };
}

/** Stores each session by token hash; the result carries the raw token. */
export async function seedSessions(db: Executor, rows: ReadonlyArray<SessionSeed>) {
  const seeded: SeededSession[] = [];
  for (const row of rows) {
    const tokenHash = await hashSessionToken(row.token);
    const { rows: inserted } = await db.execute<Omit<SeededSession, 'token'>>(sql`
      INSERT INTO identity.sessions (id, token_hash, user_id, expires_at, revoked_reason, created_at)
      VALUES (
        coalesce(${row.id ?? null}::uuid, uuidv7()),
        ${tokenHash},
        ${row.userId}::uuid,
        ${row.expiresAt.toISOString()}::timestamptz,
        ${row.revokedReason},
        coalesce(${row.createdAt?.toISOString() ?? null}::timestamptz, now())
      )
      RETURNING id, token_hash AS "tokenHash", user_id AS "userId", expires_at AS "expiresAt",
        revoked_reason AS "revokedReason", created_at AS "createdAt"
    `);
    const [session] = inserted;
    if (session === undefined) throw new Error('seedSessions: INSERT returned no row');
    seeded.push({ ...session, token: row.token });
  }
  return seeded;
}

// ---------------------------------------------------------------------------------------------
// Convenience

export const ADMIN_ROLE_NAME = 'Admin';
export const MANAGE_ACCESS_PERMISSION = 'identity:manage-access';

/** A user assigned an «Admin» role that grants `identity:manage-access`. Once per test (role names are unique). */
export async function seedAdmin(db: Executor, user: Partial<UserSeed> = {}) {
  const [admin] = await seedUsers(db, [makeUser(user)]);
  const [role] = await seedAccessRoles(db, [
    makeAccessRole({ name: ADMIN_ROLE_NAME, permissionKeys: [MANAGE_ACCESS_PERMISSION] }),
  ]);
  if (admin === undefined || role === undefined) throw new Error('seedAdmin: seeding failed');
  await seedUserAccessRoles(db, [{ userId: admin.id, accessRoleId: role.id }]);
  return { user: admin, role };
}
