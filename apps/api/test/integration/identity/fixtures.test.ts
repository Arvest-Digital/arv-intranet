import {
  hashSessionToken,
  MANAGE_ACCESS_PERMISSION,
  makeAccessRole,
  makeSession,
  makeUser,
  seedAccessRoles,
  seedAdmin,
  seedSessions,
  seedUserAccessRoles,
  seedUsers,
} from '@arv/db/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, withDb } from '../../helpers';

beforeEach(resetDb);

type Db = Parameters<Parameters<typeof withDb>[0]>[0];

type Resolved = {
  userId: string | null;
  expired: boolean;
  revokedReason: string | null;
  grantedKeys: string[];
};

// The shape of the T09 `resolve(hash)` lookup, in raw SQL: session by hash → its user's roles → keys.
const resolve = async (db: Db, tokenHash: string) => {
  const { rows } = await db.execute<Resolved>(
    `SELECT s.user_id AS "userId",
            s.expires_at <= now() AS expired,
            s.revoked_reason AS "revokedReason",
            coalesce(
              array_agg(DISTINCT p.permission_key) FILTER (WHERE p.permission_key IS NOT NULL),
              '{}'
            ) AS "grantedKeys"
     FROM identity.sessions s
     LEFT JOIN identity.users u ON u.id = s.user_id
     LEFT JOIN identity.user_access_roles uar ON uar.user_id = u.id
     LEFT JOIN identity.access_role_permissions p ON p.access_role_id = uar.access_role_id
     WHERE s.token_hash = '${tokenHash}'
     GROUP BY s.id`,
  );
  return rows[0];
};

describe('identity fixtures', () => {
  it('seedAdmin + seedSessions produce a session that resolves to manage-access', async () => {
    const { session, resolved, admin } = await withDb(async (db) => {
      const admin = await seedAdmin(db);
      const [session] = await seedSessions(db, [makeSession({ userId: admin.user.id })]);
      const resolved = await resolve(db, await hashSessionToken(session!.token));
      return { session: session!, resolved, admin };
    });

    expect(admin.role.name).toBe('Admin');
    expect(admin.user.email).toMatch(/^user-\d+@example\.test$/);
    expect(admin.user.name).toMatch(/^Test User \d+$/);
    expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(resolved).toEqual({
      userId: admin.user.id,
      expired: false,
      revokedReason: null,
      grantedKeys: [MANAGE_ACCESS_PERMISSION],
    });
  });

  it('unions keys across roles and keeps back-dated and revoked sessions', async () => {
    const result = await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      const roles = await seedAccessRoles(db, [
        makeAccessRole({ permissionKeys: ['a:one', 'a:two'] }),
        makeAccessRole({ permissionKeys: ['a:two', 'a:three'] }),
      ]);
      await seedUserAccessRoles(
        db,
        roles.map((role) => ({ userId: user!.id, accessRoleId: role.id })),
      );
      const [active, expired, revoked] = await seedSessions(db, [
        makeSession({ userId: user!.id }),
        makeSession({ userId: user!.id, expiresAt: new Date(Date.now() - 60_000) }),
        makeSession({ userId: user!.id, revokedReason: 'access-removed' }),
      ]);
      return {
        active: await resolve(db, active!.tokenHash),
        expired: await resolve(db, expired!.tokenHash),
        revoked: await resolve(db, revoked!.tokenHash),
      };
    });

    expect([...result.active!.grantedKeys].sort()).toEqual(['a:one', 'a:three', 'a:two']);
    expect(result.expired!.expired).toBe(true);
    expect(result.revoked!.revokedReason).toBe('access-removed');
  });

  it('reset empties the identity access tables', async () => {
    const counts = await withDb(async (db) => {
      const admin = await seedAdmin(db);
      await seedSessions(db, [makeSession({ userId: admin.user.id })]);
      await resetDb();
      const { rows } = await db.execute<Record<string, number>>(
        `SELECT
           (SELECT count(*)::int FROM identity.users) AS users,
           (SELECT count(*)::int FROM identity.access_roles) AS roles,
           (SELECT count(*)::int FROM identity.access_role_permissions) AS grants,
           (SELECT count(*)::int FROM identity.user_access_roles) AS assignments,
           (SELECT count(*)::int FROM identity.sessions) AS sessions`,
      );
      return rows[0];
    });
    expect(counts).toEqual({ users: 0, roles: 0, grants: 0, assignments: 0, sessions: 0 });
  });
});
