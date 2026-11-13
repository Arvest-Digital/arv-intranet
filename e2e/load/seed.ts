import { mkdir, writeFile } from 'node:fs/promises';
import { migrateDatabase } from '@arv/db/migrate';
import {
  ADMIN_ROLE_NAME,
  MANAGE_ACCESS_PERMISSION,
  makeAccessRole,
  makeSession,
  makeUser,
  resetDatabase,
  seedAccessRoles,
  seedSessions,
  seedUserAccessRoles,
  seedUsers,
} from '@arv/db/testing';
import { TEST_DATABASE_URL, withDb } from '../db';

// Seeds `arv_test` for the k6 load test (sad §10 Scenario 2c, PRD §6 Capacity headroom):
// 100 users, 50 access roles, their assignments and one live session each. Writes the session
// tokens for `identity.k6.js` to `load/.out/seed.json` (git-ignored).
// Run: `pnpm --filter @arv/e2e load:seed`.

const USERS = 100;
const ROLES = 50;
/** Admins among the 100 users; the company has 1-2 (PRD §6.1). */
const ADMINS = 2;
/** Access roles assigned to each ordinary user, so the actor lookup joins real rows. */
const ROLES_PER_USER = 3;
/** Of the 50 roles, one per admin is the role it saves in a loop ("save access role", PRD §6). */
const SCRATCH_ROLES = ADMINS;

/** `items[i]`, or a thrown error: the seed's arrays are built to size, so a miss is a bug. */
const at = <T>(items: ReadonlyArray<T>, i: number): T => {
  const item = items[i];
  if (item === undefined) throw new Error(`seed: no item at index ${i}`);
  return item;
};

const OUT_FILE = new URL('./.out/seed.json', import.meta.url);

export type LoadSeed = {
  /** Sessions of every seeded user (admins included), for the access-check scenario. */
  userTokens: string[];
  /** One entry per admin: its session, and the access role it saves and assigns. */
  admins: { token: string; scratchRoleId: string }[];
  /** Ordinary access roles an admin assigns to the users it adds. */
  roleIds: string[];
};

async function seed(): Promise<LoadSeed> {
  await migrateDatabase(TEST_DATABASE_URL);
  return withDb(async (db) => {
    await resetDatabase(db);

    const [adminRole, ...others] = await seedAccessRoles(db, [
      makeAccessRole({ name: ADMIN_ROLE_NAME, permissionKeys: [MANAGE_ACCESS_PERMISSION] }),
      ...Array.from({ length: ROLES - 1 }, () => makeAccessRole()),
    ]);
    if (adminRole === undefined) throw new Error('seed: no admin role');
    const scratchRoles = others.slice(0, SCRATCH_ROLES);
    const roles = others.slice(SCRATCH_ROLES);

    const users = await seedUsers(
      db,
      Array.from({ length: USERS }, () => makeUser()),
    );
    const admins = users.slice(0, ADMINS);

    await seedUserAccessRoles(db, [
      ...admins.map((admin) => ({ userId: admin.id, accessRoleId: adminRole.id })),
      ...users.flatMap((user, u) =>
        Array.from({ length: ROLES_PER_USER }, (_, r) => ({
          userId: user.id,
          accessRoleId: at(roles, (u * ROLES_PER_USER + r) % roles.length).id,
        })),
      ),
    ]);

    const sessions = await seedSessions(
      db,
      users.map((user) => makeSession({ userId: user.id })),
    );

    return {
      userTokens: sessions.map((session) => session.token),
      admins: admins.map((_, i) => ({
        token: at(sessions, i).token,
        scratchRoleId: at(scratchRoles, i).id,
      })),
      roleIds: roles.map((role) => role.id),
    };
  });
}

const result = await seed();
await mkdir(new URL('./.out/', import.meta.url), { recursive: true });
await writeFile(OUT_FILE, JSON.stringify(result));
console.log(
  `Seeded ${USERS} users (${ADMINS} admins), ${ROLES} access roles and ${result.userTokens.length} sessions.`,
);
