import {
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
import {
  type Call,
  EDIT_ALLOCATIONS,
  errorOf,
  MANAGE_ACCESS,
  makeTestApp,
  request,
  UNDECLARED,
} from './qg1-pipeline';

/**
 * T21 — QG-1 scenario 1a, Revocation (sad §10; PRD §6 Revocation; AC-07, AC-11, AC-17, AC-18).
 *
 * Two signed-in users hold edit allocations through different roles. For each change an admin can
 * make, the affected user is served first (so anything that remembered their access would be warm),
 * the change goes through the admin routes, and their very next action is refused while the other
 * user is still served. Any cache of sessions or permissions — in the isolate or in Hyperdrive —
 * makes these fail.
 */

beforeEach(resetDb);

const app = makeTestApp();
const call = (path: string, init?: Call) => app.fetch(request(path, init));

/** The stand-in for scheduling's «save an allocation change» (AC-17). */
const saveAllocation = (token: string) =>
  call('/test-scheduling/allocations', { method: 'POST', token });

/**
 * An admin; `affected` holds «Planner» (edit allocations), `other` holds «Editors» (edit
 * allocations too, so role-wide changes to «Planner» leave them alone). Each has a live session.
 */
const setup = () =>
  withDb(async (db) => {
    const { user: admin } = await seedAdmin(db);
    const [affected, other] = await seedUsers(db, [makeUser(), makeUser()]);
    const [planner, editors] = await seedAccessRoles(db, [
      makeAccessRole({ name: 'Planner', permissionKeys: [EDIT_ALLOCATIONS] }),
      makeAccessRole({ name: 'Editors', permissionKeys: [EDIT_ALLOCATIONS] }),
    ]);
    await seedUserAccessRoles(db, [
      { userId: affected!.id, accessRoleId: planner!.id },
      { userId: other!.id, accessRoleId: editors!.id },
    ]);
    const [adminSession, affectedSession, otherSession] = await seedSessions(db, [
      makeSession({ userId: admin.id }),
      makeSession({ userId: affected!.id }),
      makeSession({ userId: other!.id }),
    ]);
    return {
      admin: { ...admin, token: adminSession!.token },
      affected: { ...affected!, token: affectedSession!.token },
      other: { ...other!, token: otherSession!.token },
      planner: planner!,
      editors: editors!,
    };
  });

type World = Awaited<ReturnType<typeof setup>>;

const changes: ReadonlyArray<
  readonly [string, (world: World) => Promise<Response>, ReadonlyArray<number>]
> = [
  [
    'removes the user from the access list (AC-07)',
    ({ admin, affected }) =>
      call(`/users/${affected.id}`, { method: 'DELETE', token: admin.token }),
    [401],
  ],
  [
    'takes «Planner» from the user (AC-17)',
    ({ admin, affected }) =>
      call(`/users/${affected.id}/access-roles`, {
        method: 'PUT',
        token: admin.token,
        body: { accessRoleIds: [] },
      }),
    [403],
  ],
  [
    'removes edit allocations from «Planner» (AC-11, AC-17)',
    ({ admin, planner }) =>
      call(`/identity/access-roles/${planner.id}`, {
        method: 'PUT',
        token: admin.token,
        body: { name: planner.name, permissionKeys: [] },
      }),
    [403],
  ],
  [
    'deletes «Planner» (AC-11)',
    ({ admin, planner }) =>
      call(`/identity/access-roles/${planner.id}`, { method: 'DELETE', token: admin.token }),
    [403],
  ],
];

describe('revocation applies from the next request (QG-1 1a)', () => {
  it.each(changes)('when an admin %s', async (_, change, refusedWith) => {
    const world = await setup();
    // Both users are served before the change.
    expect((await saveAllocation(world.affected.token)).status).toBe(204);
    expect((await saveAllocation(world.other.token)).status).toBe(204);

    const changed = await change(world);
    expect(changed.status).toBeLessThan(300);

    const refused = await saveAllocation(world.affected.token);
    expect(refusedWith).toContain(refused.status);
    expect(await errorOf(refused)).toMatchObject({
      _tag: refused.status === 401 ? 'Unauthenticated' : 'Forbidden',
    });
    // The other user is still served.
    expect((await saveAllocation(world.other.token)).status).toBe(204);
  });

  it('tells a removed user they no longer have access, on every route (AC-07)', async () => {
    const { admin, affected } = await setup();
    expect((await call('/identity/me', { token: affected.token })).status).toBe(200);

    await call(`/users/${affected.id}`, { method: 'DELETE', token: admin.token });

    for (const res of [
      await call('/identity/me', { token: affected.token }),
      await saveAllocation(affected.token),
    ]) {
      expect(res.status).toBe(401);
      expect(await errorOf(res)).toMatchObject({ code: 'identity.access_removed' });
    }
  });

  it('keeps what another of the user’s roles still grants (AC-11)', async () => {
    const { admin, affected, planner, editors } = await setup();
    await withDb((db) =>
      seedUserAccessRoles(db, [{ userId: affected.id, accessRoleId: editors.id }]),
    );
    expect((await saveAllocation(affected.token)).status).toBe(204);

    await call(`/identity/access-roles/${planner.id}`, { method: 'DELETE', token: admin.token });

    expect((await saveAllocation(affected.token)).status).toBe(204);
  });

  it('takes manage access from a second admin on their next request', async () => {
    const { admin } = await setup();
    const second = await withDb(async (db) => {
      const [user] = await seedUsers(db, [makeUser()]);
      const { rows } = await db.execute<{ id: string }>(
        `SELECT id FROM identity.access_roles WHERE name = 'Admin'`,
      );
      await seedUserAccessRoles(db, [{ userId: user!.id, accessRoleId: rows[0]!.id }]);
      const [session] = await seedSessions(db, [makeSession({ userId: user!.id })]);
      return { ...user!, token: session!.token };
    });
    expect((await call('/users', { token: second.token })).status).toBe(200);

    const res = await call(`/users/${second.id}/access-roles`, {
      method: 'PUT',
      token: admin.token,
      body: { accessRoleIds: [] },
    });
    expect(res.status).toBe(200);

    const refused = await call('/users', { token: second.token });
    expect(refused.status).toBe(403);
    expect(await errorOf(refused)).toMatchObject({ _tag: 'Forbidden' });
    expect((await call('/users', { token: admin.token })).status).toBe(200);
  });
});

describe('a permission no module declares (AC-18)', () => {
  it('is refused to everyone, an admin holding it through a role included', async () => {
    const { admin, affected } = await setup();
    await withDb(async (db) => {
      const [role] = await seedAccessRoles(db, [
        makeAccessRole({ name: 'Approvers', permissionKeys: [UNDECLARED, MANAGE_ACCESS] }),
      ]);
      await seedUserAccessRoles(db, [
        { userId: admin.id, accessRoleId: role!.id },
        { userId: affected.id, accessRoleId: role!.id },
      ]);
    });

    for (const token of [admin.token, affected.token]) {
      const res = await call('/test-scheduling/approvals', { method: 'POST', token });
      expect(res.status).toBe(403);
      expect(await errorOf(res)).toMatchObject({ _tag: 'Forbidden' });
    }
  });
});
