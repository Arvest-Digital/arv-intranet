import { env } from 'cloudflare:test';
import { DatabaseLive, UnitOfWorkLive } from '@arv/db';
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
import { IdentityApi, identityPermissions } from '@arv/identity';
import { identityRoutes } from '@arv/identity/http';
import { IdentityConfig, IdentityModuleLive, permissionCatalogLayer } from '@arv/identity/layer';
import { type Actor, CurrentActor, Permission, Unauthenticated } from '@arv/kernel';
import { Effect, Exit, Layer, Option } from 'effect';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppEnv } from '../../../src/env';
import { authenticate } from '../../../src/middleware/authenticate';
import { api, resetDb, withDb } from '../../helpers';

/**
 * T18 — the access list (openapi.yaml `listUsers`, `createUser`, `getUser`, `renameUser`,
 * `removeUser`, `setUserAccessRoles`; AC-04, AC-05, AC-06, AC-07, AC-08, AC-12, AC-14, AC-21).
 *
 * Requests run through a test copy of the host pipeline: the real `authenticate` middleware, then
 * identity's real module Layer on the test database, with a company domain configured (the host's
 * own composition has none until T20, so every add through it would be refused as foreign). The
 * real Worker is checked for the mount and the anonymous and non-admin refusals.
 */

beforeEach(resetDb);

// ---------------------------------------------------------------------------------------------
// Test composition

const COMPANY_DOMAIN = 'example.test'; // the fixtures' default email domain
const MANAGE_ACCESS = 'identity:manage-access';
const VIEW_BOARD = 'scheduling:view-whole-board';

/** A second module's declaration, so combined permissions span two features (AC-12). */
const viewBoard = {
  key: Permission.make(VIEW_BOARD),
  name: 'View the whole board',
  description: "See every resource's allocations on the schedule board.",
  feature: 'Resource scheduling',
};

const config: IdentityConfig['Type'] = {
  companyDomain: COMPANY_DOMAIN,
  firstAdminEmail: '',
  signInReturnUrl: 'https://intranet.example.test/sign-in/return',
  googleClientId: 'test-client.apps.example.test',
};

const IdentityTestLive = IdentityModuleLive({
  google: {
    clientSecret: 'test-secret',
    fetch: () => Promise.reject(new Error('no network in tests')),
  },
}).pipe(
  Layer.provideMerge(
    Layer.merge(
      permissionCatalogLayer([...identityPermissions, viewBoard]),
      Layer.succeed(IdentityConfig, config),
    ),
  ),
);

const testAppLayer = (actor: Actor) =>
  IdentityTestLive.pipe(
    Layer.provideMerge(Layer.merge(UnitOfWorkLive, Layer.succeed(CurrentActor, actor))),
    Layer.provide(DatabaseLive(env.HYPERDRIVE.connectionString)),
  );

const testApp = new Hono<AppEnv>()
  .use(authenticate())
  .use(
    createMiddleware<AppEnv>(async (c, next) => {
      c.set('appLayer', testAppLayer(c.get('actor')));
      await next();
    }),
  )
  .route('/', identityRoutes);

type Call = { readonly method?: string; readonly token?: string; readonly body?: unknown };

const request = (path: string, { method = 'GET', token, body }: Call = {}) => {
  const headers = new Headers();
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return new Request(`http://api.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
};

/** Through the test pipeline (configured company domain, test catalog). */
const call = (path: string, init?: Call) => testApp.fetch(request(path, init), env);

/** Through the real Worker and its own composition. */
const callHost = (path: string, init?: Call) => {
  const req = request(path, init);
  return api(path, { method: req.method, headers: req.headers, body: req.body });
};

const errorOf = async (res: Response) =>
  ((await res.json()) as { error: Record<string, unknown> }).error;

type UserBody = {
  id: string;
  email: string;
  name: string;
  accessRoles: Array<{ id: string; name: string }>;
  combinedPermissions: Array<{ key: string; name: string; description: string; feature: string }>;
  createdAt: string;
};
type PageBody = {
  items: UserBody[];
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor: string | null;
};

// ---------------------------------------------------------------------------------------------
// Fixtures

/**
 * An admin (via «Admin», manage access only), a member holding «Staff» and no manage access, and
 * the unassigned role «Planner» (view the whole board); each user with one live session.
 */
const setup = () =>
  withDb(async (db) => {
    const { user: admin, role: adminRole } = await seedAdmin(db);
    const [member] = await seedUsers(db, [makeUser()]);
    const [staff, planner] = await seedAccessRoles(db, [
      makeAccessRole({ name: 'Staff' }),
      makeAccessRole({ name: 'Planner', permissionKeys: [VIEW_BOARD] }),
    ]);
    await seedUserAccessRoles(db, [{ userId: member!.id, accessRoleId: staff!.id }]);
    const [adminSession, memberSession] = await seedSessions(db, [
      makeSession({ userId: admin.id }),
      makeSession({ userId: member!.id }),
    ]);
    return {
      admin: { ...admin, token: adminSession!.token },
      member: { ...member!, token: memberSession!.token },
      roles: { admin: adminRole, staff: staff!, planner: planner! },
    };
  });

/** Every identity row the access list can touch, for «nothing changed» comparisons. */
const snapshot = () =>
  withDb(async (db) => {
    const users = await db.execute<{ id: string; email: string; name: string }>(
      'SELECT id, email, name FROM identity.users ORDER BY id',
    );
    const sessions = await db.execute<{ userId: string | null; revokedReason: string | null }>(
      `SELECT user_id AS "userId", revoked_reason AS "revokedReason"
       FROM identity.sessions ORDER BY id`,
    );
    const assignments = await db.execute<{ userId: string; accessRoleId: string }>(
      `SELECT user_id AS "userId", access_role_id AS "accessRoleId"
       FROM identity.user_access_roles ORDER BY user_id, access_role_id`,
    );
    return { users: users.rows, sessions: sessions.rows, assignments: assignments.rows };
  });

const roleIdsOf = async (userId: string) =>
  (await snapshot()).assignments
    .filter((row) => row.userId === userId)
    .map((row) => row.accessRoleId)
    .sort();

/** The actor identity resolves for `token`, as the host's `authenticate` asks for it. */
const resolve = (token: string) =>
  Effect.runPromiseExit(
    Effect.flatMap(IdentityApi, (identity) => identity.resolveActor(Option.some(token))).pipe(
      Effect.provide(IdentityTestLive),
      Effect.provide(DatabaseLive(env.HYPERDRIVE.connectionString)),
    ),
  );

const UNKNOWN_ID = '01933b8e-0000-7000-8000-00000000ffff';

const FORBIDDEN = {
  _tag: 'Forbidden',
  code: 'identity.missing_permission',
  message: `You lack the permission ${MANAGE_ACCESS}`,
  details: { missingPermissions: [MANAGE_ACCESS] },
};

/** One call per access-list operation, aimed at `target`. */
const operations = (target: string, roleId: string): Array<[string, string, Call]> => [
  ['listUsers', '/users', {}],
  [
    'createUser',
    '/users',
    { method: 'POST', body: { email: 'new@example.test', name: 'New', accessRoleIds: [] } },
  ],
  ['getUser', `/users/${target}`, {}],
  ['renameUser', `/users/${target}`, { method: 'PATCH', body: { name: 'Renamed' } }],
  ['removeUser', `/users/${target}`, { method: 'DELETE' }],
  [
    'setUserAccessRoles',
    `/users/${target}/access-roles`,
    { method: 'PUT', body: { accessRoleIds: [roleId] } },
  ],
];

// ---------------------------------------------------------------------------------------------
// Authorization (AC-08)

describe('access-list authorization (AC-08)', () => {
  it('refuses every operation to a user without manage access, showing and changing nothing', async () => {
    const { admin, member, roles } = await setup();
    const before = await snapshot();

    for (const [operation, path, init] of operations(admin.id, roles.admin.id)) {
      const res = await call(path, { ...init, token: member.token });
      expect(res.status, operation).toBe(403);
      expect(await res.json(), operation).toEqual({ error: FORBIDDEN });
    }
    expect(await snapshot()).toEqual(before);
  });

  it('refuses every operation to an anonymous caller with 401', async () => {
    const { admin, roles } = await setup();
    const before = await snapshot();

    for (const [operation, path, init] of operations(admin.id, roles.admin.id)) {
      const res = await call(path, init);
      expect(res.status, operation).toBe(401);
      expect(await errorOf(res), operation).toMatchObject({ code: 'platform.unauthenticated' });
    }
    expect(await snapshot()).toEqual(before);
  });

  it('is mounted in the api host behind the same guard', async () => {
    const { admin, member } = await setup();

    const anonymous = await callHost('/users');
    expect(anonymous.status).toBe(401);

    const nonAdmin = await callHost('/users', { token: member.token });
    expect(nonAdmin.status).toBe(403);
    expect(await nonAdmin.json()).toEqual({ error: FORBIDDEN });

    const listed = await callHost('/users', { token: admin.token });
    expect(listed.status).toBe(200);
    expect(((await listed.json()) as PageBody).items).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------
// listUsers

describe('GET /users', () => {
  it('lists every user in id order with roles, combined permissions and ISO dates', async () => {
    const { admin, member, roles } = await setup();

    const res = await call('/users', { token: admin.token });

    expect(res.status).toBe(200);
    const page = (await res.json()) as PageBody;
    expect(page).toMatchObject({ hasNext: false, hasPrev: false, nextCursor: null });
    expect(page.items.map((user) => user.id)).toEqual([admin.id, member.id].sort());
    const listedAdmin = page.items.find((user) => user.id === admin.id)!;
    expect(listedAdmin).toMatchObject({
      email: admin.email,
      name: admin.name,
      accessRoles: [{ id: roles.admin.id, name: 'Admin' }],
      combinedPermissions: [identityPermissions[0]],
    });
    expect(new Date(listedAdmin.createdAt).toISOString()).toBe(listedAdmin.createdAt);
  });

  it('pages with limit, after and before', async () => {
    const { admin } = await setup();
    await withDb((db) => seedUsers(db, [makeUser(), makeUser(), makeUser()]));
    const all = (await (await call('/users', { token: admin.token })).json()) as PageBody;
    const ids = all.items.map((user) => user.id);
    expect(ids).toHaveLength(5);

    const first = (await (await call('/users?limit=2', { token: admin.token })).json()) as PageBody;
    expect(first.items.map((user) => user.id)).toEqual(ids.slice(0, 2));
    expect(first).toMatchObject({ hasNext: true, hasPrev: false, nextCursor: ids[1] });

    const second = (await (
      await call(`/users?limit=2&after=${first.nextCursor}`, { token: admin.token })
    ).json()) as PageBody;
    expect(second.items.map((user) => user.id)).toEqual(ids.slice(2, 4));
    expect(second).toMatchObject({ hasNext: true, hasPrev: true });

    const back = (await (
      await call(`/users?limit=2&before=${ids[2]}`, { token: admin.token })
    ).json()) as PageBody;
    expect(back.items.map((user) => user.id)).toEqual(ids.slice(0, 2));
  });

  it.each([
    ['a limit above 100', '?limit=101'],
    ['a non-UUID cursor', '?after=page-2'],
    ['both cursors', `?after=${UNKNOWN_ID}&before=${UNKNOWN_ID}`],
  ])('answers 400 for %s', async (_, query) => {
    const { admin } = await setup();
    const res = await call(`/users${query}`, { token: admin.token });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatchObject({
      _tag: 'ValidationError',
      code: 'platform.validation_failed',
    });
  });
});

// ---------------------------------------------------------------------------------------------
// createUser

describe('POST /users', () => {
  const add = (token: string, body: unknown) => call('/users', { method: 'POST', token, body });

  it('adds the joiner with exactly the chosen roles (AC-04)', async () => {
    const { admin, roles } = await setup();

    const res = await add(admin.token, {
      email: 'Joiner@Example.Test',
      name: 'New Joiner',
      accessRoleIds: [roles.staff.id, roles.planner.id],
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as UserBody;
    expect(created).toMatchObject({
      email: 'joiner@example.test',
      name: 'New Joiner',
      combinedPermissions: [viewBoard],
    });
    expect(created.accessRoles.map((role) => role.name).sort()).toEqual(['Planner', 'Staff']);
    expect(created.id[14]).toBe('7'); // UUIDv7 from the database
    expect(await roleIdsOf(created.id)).toEqual([roles.staff.id, roles.planner.id].sort());

    const fetched = await call(`/users/${created.id}`, { token: admin.token });
    expect(await fetched.json()).toEqual(created);
  });

  it('adds a joiner with no roles when the admin unticks them all (AC-04)', async () => {
    const { admin } = await setup();
    const res = await add(admin.token, {
      email: 'bare@example.test',
      name: 'Bare',
      accessRoleIds: [],
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ accessRoles: [], combinedPermissions: [] });
  });

  it('refuses an address on another domain and lists nobody (AC-05)', async () => {
    const { admin } = await setup();
    const before = await snapshot();

    const res = await add(admin.token, {
      email: 'someone@other.test',
      name: 'Someone',
      accessRoleIds: [],
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        _tag: 'ValidationError',
        code: 'identity.email_not_company_domain',
        message: 'Only company-domain addresses can be added',
        details: { rules: ['not_company_domain'] },
      },
    });
    expect(await snapshot()).toEqual(before);
  });

  it('refuses a malformed address and lists nobody (AC-05)', async () => {
    const { admin } = await setup();
    const before = await snapshot();

    const res = await add(admin.token, { email: 'not-an-email', name: 'X', accessRoleIds: [] });

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatchObject({ code: 'platform.validation_failed' });
    expect(await snapshot()).toEqual(before);
  });

  it('refuses an address already listed in another letter case (AC-06)', async () => {
    const { admin, member } = await setup();
    const before = await snapshot();

    const res = await add(admin.token, {
      email: member.email.toUpperCase(),
      name: 'Twin',
      accessRoleIds: [],
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        _tag: 'Conflict',
        code: 'identity.email_taken',
        message: 'This address is already on the access list',
      },
    });
    expect(await snapshot()).toEqual(before);
  });

  it('refuses a ticked role that no longer exists and lists nobody', async () => {
    const { admin, roles } = await setup();
    const before = await snapshot();

    const res = await add(admin.token, {
      email: 'joiner@example.test',
      name: 'Joiner',
      accessRoleIds: [roles.staff.id, UNKNOWN_ID],
    });

    expect(res.status).toBe(404);
    expect(await errorOf(res)).toMatchObject({
      _tag: 'NotFound',
      code: 'identity.access_role_not_found',
    });
    expect(await snapshot()).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------
// getUser

describe('GET /users/:userId', () => {
  it('returns the user with their roles and combined permissions (AC-12)', async () => {
    const { admin, member, roles } = await setup();
    const res = await call(`/users/${member.id}`, { token: admin.token });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: member.id,
      accessRoles: [{ id: roles.staff.id, name: 'Staff' }],
      combinedPermissions: [],
    });
  });

  it('answers 404 identity.user_not_found for an unknown id', async () => {
    const { admin } = await setup();
    const res = await call(`/users/${UNKNOWN_ID}`, { token: admin.token });
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toMatchObject({ code: 'identity.user_not_found' });
  });

  it('answers 400 for a malformed id', async () => {
    const { admin } = await setup();
    const res = await call('/users/42', { token: admin.token });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatchObject({ code: 'platform.validation_failed' });
  });
});

// ---------------------------------------------------------------------------------------------
// renameUser

describe('PATCH /users/:userId', () => {
  const rename = (token: string, id: string, body: unknown) =>
    call(`/users/${id}`, { method: 'PATCH', token, body });

  it('changes only the name; roles and sessions stay (AC-21)', async () => {
    const { admin, member, roles } = await setup();
    await withDb((db) =>
      seedUserAccessRoles(db, [{ userId: member.id, accessRoleId: roles.planner.id }]),
    );
    const before = await snapshot();

    const res = await rename(admin.token, member.id, { name: 'Anna Koval' });

    expect(res.status).toBe(200);
    const renamed = (await res.json()) as UserBody;
    expect(renamed).toMatchObject({ id: member.id, email: member.email, name: 'Anna Koval' });
    expect(renamed.accessRoles.map((role) => role.name).sort()).toEqual(['Planner', 'Staff']);

    const after = await snapshot();
    expect(after.users.find((user) => user.id === member.id)?.name).toBe('Anna Koval');
    expect(after.sessions).toEqual(before.sessions);
    expect(after.assignments).toEqual(before.assignments);
    expect((await call('/identity/me', { token: member.token })).status).toBe(200);
  });

  it('refuses a body carrying email and changes nothing (AC-21)', async () => {
    const { admin, member } = await setup();
    const before = await snapshot();

    const res = await rename(admin.token, member.id, {
      name: 'Anna Koval',
      email: 'anna@example.test',
    });

    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatchObject({ code: 'platform.validation_failed' });
    expect(await snapshot()).toEqual(before);
  });

  it('answers 404 for a user no longer listed', async () => {
    const { admin } = await setup();
    const res = await rename(admin.token, UNKNOWN_ID, { name: 'Ghost' });
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toMatchObject({ code: 'identity.user_not_found' });
  });
});

// ---------------------------------------------------------------------------------------------
// removeUser

describe('DELETE /users/:userId', () => {
  const remove = (token: string, id: string) => call(`/users/${id}`, { method: 'DELETE', token });

  it('removes the user, their roles and every session; their next request is refused (AC-07)', async () => {
    const { admin, member } = await setup();
    const [secondDevice] = await withDb((db) =>
      seedSessions(db, [makeSession({ userId: member.id })]),
    );

    const res = await remove(admin.token, member.id);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    const after = await snapshot();
    expect(after.users.map((user) => user.id)).toEqual([admin.id]);
    expect(after.assignments.some((row) => row.userId === member.id)).toBe(false);
    // Both sessions survive as revoked rows detached from the user, so the reason can be shown.
    expect(after.sessions.filter((row) => row.revokedReason === 'access-removed')).toEqual([
      { userId: null, revokedReason: 'access-removed' },
      { userId: null, revokedReason: 'access-removed' },
    ]);

    // Their next request resolves to «access removed». The host's 401 answer for it is T20's.
    for (const token of [member.token, secondDevice!.token]) {
      expect(await resolve(token)).toEqual(
        Exit.fail(new Unauthenticated({ reason: 'access-removed' })),
      );
    }
    // The admin's own session is untouched.
    expect((await call('/identity/me', { token: admin.token })).status).toBe(200);
  });

  it('refuses to remove the only admin and changes nothing (AC-14)', async () => {
    const { admin } = await setup();
    const before = await snapshot();

    const res = await remove(admin.token, admin.id);

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: {
        _tag: 'Conflict',
        code: 'identity.last_admin_required',
        message: 'The intranet must keep at least one admin. Appoint another admin first.',
      },
    });
    expect(await snapshot()).toEqual(before);
    expect((await call('/identity/me', { token: admin.token })).status).toBe(200);
  });

  it('removes one of two admins (AC-14)', async () => {
    const { admin, member, roles } = await setup();
    await withDb((db) =>
      seedUserAccessRoles(db, [{ userId: member.id, accessRoleId: roles.admin.id }]),
    );
    const res = await remove(admin.token, member.id);
    expect(res.status).toBe(204);
  });

  it('answers 404 for a user no longer listed', async () => {
    const { admin } = await setup();
    const before = await snapshot();
    const res = await remove(admin.token, UNKNOWN_ID);
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toMatchObject({ code: 'identity.user_not_found' });
    expect(await snapshot()).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------
// setUserAccessRoles

describe('PUT /users/:userId/access-roles', () => {
  const setRoles = (token: string, id: string, accessRoleIds: string[]) =>
    call(`/users/${id}/access-roles`, { method: 'PUT', token, body: { accessRoleIds } });

  it('gives the user exactly the chosen roles and their combined permissions (AC-12)', async () => {
    const { admin, member, roles } = await setup();

    const res = await setRoles(admin.token, member.id, [roles.staff.id, roles.planner.id]);

    expect(res.status).toBe(200);
    const updated = (await res.json()) as UserBody;
    expect(updated.accessRoles.map((role) => role.name).sort()).toEqual(['Planner', 'Staff']);
    expect(updated.combinedPermissions).toEqual([viewBoard]);
    expect(await roleIdsOf(member.id)).toEqual([roles.staff.id, roles.planner.id].sort());
  });

  it("applies from the user's next request (AC-12)", async () => {
    const { admin, member, roles } = await setup();
    expect((await call('/users', { token: member.token })).status).toBe(403);

    await setRoles(admin.token, member.id, [roles.staff.id, roles.admin.id]);

    expect((await call('/users', { token: member.token })).status).toBe(200);
  });

  it('accepts an empty set', async () => {
    const { admin, member } = await setup();
    const res = await setRoles(admin.token, member.id, []);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ accessRoles: [], combinedPermissions: [] });
    expect(await roleIdsOf(member.id)).toEqual([]);
  });

  it('refuses to take «Admin» from the only admin and changes nothing (AC-14)', async () => {
    const { admin, roles } = await setup();
    const before = await snapshot();

    const res = await setRoles(admin.token, admin.id, [roles.staff.id]);

    expect(res.status).toBe(409);
    expect(await errorOf(res)).toMatchObject({ code: 'identity.last_admin_required' });
    expect(await snapshot()).toEqual(before);
  });

  it('refuses a role that no longer exists and changes nothing', async () => {
    const { admin, member, roles } = await setup();
    const before = await snapshot();

    const res = await setRoles(admin.token, member.id, [roles.planner.id, UNKNOWN_ID]);

    expect(res.status).toBe(404);
    expect(await errorOf(res)).toMatchObject({ code: 'identity.access_role_not_found' });
    expect(await snapshot()).toEqual(before);
  });

  it('answers 404 for a user no longer listed', async () => {
    const { admin, roles } = await setup();
    const res = await setRoles(admin.token, UNKNOWN_ID, [roles.staff.id]);
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toMatchObject({ code: 'identity.user_not_found' });
  });
});
