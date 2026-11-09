import { makeUser, seedUsers } from '@arv/db/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, withDb } from '../../helpers';

beforeEach(resetDb);

type Db = Parameters<Parameters<typeof withDb>[0]>[0];

// Raw SQL with test-owned literals: the host has no drizzle-orm dependency and must not import module tables.
const insertRole = async (db: Db, name: string, isPreselected = false) => {
  const { rows } = await db.execute<{ id: string }>(
    `INSERT INTO identity.access_roles (name, is_preselected)
     VALUES ('${name}', ${isPreselected}) RETURNING id`,
  );
  return rows[0]!.id;
};

/** The Postgres error drizzle wrapped: SQLSTATE and the violated constraint/index. */
async function pgError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  const cause = (error as { cause?: { code?: string; constraint?: string } } | undefined)?.cause;
  return { code: cause?.code, constraint: cause?.constraint };
}

const uniqueViolation = (constraint: string) => ({ code: '23505', constraint });

describe('identity.access_roles', () => {
  it('rejects a name that differs only in case and surrounding spaces', async () => {
    const result = await withDb(async (db) => {
      await insertRole(db, 'Planner');
      return pgError(insertRole(db, 'planner '));
    });
    expect(result).toEqual(uniqueViolation('access_roles_name_key_unique'));
  });

  it('allows at most one pre-selected role', async () => {
    const result = await withDb(async (db) => {
      await insertRole(db, 'Role 1', false);
      await insertRole(db, 'Role 2', false);
      await insertRole(db, 'Role 3', true);
      return pgError(insertRole(db, 'Role 4', true));
    });
    expect(result).toEqual(uniqueViolation('access_roles_one_preselected_unique'));
  });
});

describe('deleting an identity.users row', () => {
  it('keeps its sessions with user_id null and removes its role assignments', async () => {
    const counts = await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      const roleId = await insertRole(db, 'Planner');
      await db.execute(
        `INSERT INTO identity.sessions (token_hash, user_id, expires_at)
         VALUES ('${'a'.repeat(64)}', '${user!.id}', now() + interval '7 days')`,
      );
      await db.execute(
        `INSERT INTO identity.user_access_roles (user_id, access_role_id)
         VALUES ('${user!.id}', '${roleId}')`,
      );

      await db.execute(`DELETE FROM identity.users WHERE id = '${user!.id}'`);

      const { rows } = await db.execute<{
        sessions: number;
        orphaned: number;
        assignments: number;
      }>(
        `SELECT
           (SELECT count(*)::int FROM identity.sessions) AS sessions,
           (SELECT count(*)::int FROM identity.sessions WHERE user_id IS NULL) AS orphaned,
           (SELECT count(*)::int FROM identity.user_access_roles) AS assignments`,
      );
      return rows[0];
    });
    expect(counts).toEqual({ sessions: 1, orphaned: 1, assignments: 0 });
  });
});
