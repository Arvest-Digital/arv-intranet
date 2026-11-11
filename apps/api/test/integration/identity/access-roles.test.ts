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
import { identityPermissions } from '@arv/identity';
import { identityRoutes } from '@arv/identity/http';
import { IdentityConfig, IdentityModuleLive, permissionCatalogLayer } from '@arv/identity/layer';
import { type Actor, CurrentActor, Permission, type PermissionDeclaration } from '@arv/kernel';
import { Layer } from 'effect';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppEnv } from '../../../src/env';
import { authenticate } from '../../../src/middleware/authenticate';
import { api, resetDb, withDb } from '../../helpers';

/**
 * T19 — access roles, the pre-selected mark and the permission catalog (openapi.yaml
 * `listAccessRoles`, `createAccessRole`, `getAccessRole`, `updateAccessRole`, `deleteAccessRole`,
 * `setPreselectedAccessRole`, `listPermissions`; AC-09, AC-10, AC-11, AC-13, AC-14, AC-16).
 *
 * Requests run through a test copy of the host pipeline (the real `authenticate`, identity's real
 * module Layer on the test database) over a catalog the test chooses, so AC-16 can stop and resume
 * declaring a key. The real Worker is checked for the mount and the refusals.
 */

beforeEach(resetDb);

// ---------------------------------------------------------------------------------------------
// Test composition

const MANAGE_ACCESS = 'identity:manage-access';
const VIEW_BOARD = 'scheduling:view-whole-board';
const EDIT_ALLOCATIONS = 'scheduling:edit-allocations';

const viewBoard: PermissionDeclaration = {
  key: Permission.make(VIEW_BOARD),
  name: 'View the whole board',
  description: "See every resource's allocations on the schedule board.",
  feature: 'Resource scheduling',
};
const editAllocations: PermissionDeclaration = {
  key: Permission.make(EDIT_ALLOCATIONS),
  name: 'Edit allocations',
  description: 'Create, change and remove allocations on the schedule board.',
  feature: 'Resource scheduling',
};
const manageAccess = identityPermissions[0] as PermissionDeclaration;

/** Scheduling declares both of its permissions. */
const FULL_CATALOG = [...identityPermissions, viewBoard, editAllocations];
/** Scheduling has stopped declaring edit allocations (AC-16). */
const WITHOUT_EDIT = [...identityPermissions, viewBoard];

const config: IdentityConfig['Type'] = {
  companyDomain: 'example.test',
  firstAdminEmail: '',
  signInReturnUrl: 'https://intranet.example.test/sign-in/return',
  googleClientId: 'test-client.apps.example.test',
};

const testAppLayer = (declarations: ReadonlyArray<PermissionDeclaration>, actor: Actor) =>
  IdentityModuleLive({
    google: {
      clientSecret: 'test-secret',
      fetch: () => Promise.reject(new Error('no network in tests')),
    },
  }).pipe(
    Layer.provideMerge(
      Layer.merge(permissionCatalogLayer(declarations), Layer.succeed(IdentityConfig, config)),
    ),
    Layer.provideMerge(Layer.merge(UnitOfWorkLive, Layer.succeed(CurrentActor, actor))),
    Layer.provide(DatabaseLive(env.HYPERDRIVE.connectionString)),
  );

/** The host pipeline over `declarations` as the permission catalog. */
const appWith = (declarations: ReadonlyArray<PermissionDeclaration>) =>
  new Hono<AppEnv>()
    .use(authenticate())
    .use(
      createMiddleware<AppEnv>(async (c, next) => {
        c.set('appLayer', testAppLayer(declarations, c.get('actor')));
        await next();
      }),
    )
    .route('/', identityRoutes);

type Call = {
  readonly method?: string;
  readonly token?: string;
  readonly body?: unknown;
  readonly catalog?: ReadonlyArray<PermissionDeclaration>;
};

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

/** Through the test pipeline, over the full catalog unless `catalog` says otherwise. */
const call = (path: string, { catalog = FULL_CATALOG, ...init }: Call = {}) =>
  appWith(catalog).fetch(request(path, init), env);

/** Through the real Worker and its own composition. */
const callHost = (path: string, init?: Call) => {
  const req = request(path, init);
  return api(path, { method: req.method, headers: req.headers, body: req.body });
};

const errorOf = async (res: Response) =>
  ((await res.json()) as { error: Record<string, unknown> }).error;

type RoleBody = {
  id: string;
  name: string;
  isPreselected: boolean;
  holderCount: number;
  permissions: PermissionDeclaration[];
  retiredPermissionKeys: string[];
  createdAt: string;
};
type RolePageBody = {
  items: RoleBody[];
  hasNext: boolean;
  hasPrev: boolean;
  nextCursor: string | null;
};

// ---------------------------------------------------------------------------------------------
// Fixtures

/**
 * An admin (via «Admin», manage access only), a member holding «Staff», and the unassigned role
 * «Planner» (view the whole board, edit allocations); each user with one live session.
 */
const setup = () =>
  withDb(async (db) => {
    const { user: admin, role: adminRole } = await seedAdmin(db);
    const [member] = await seedUsers(db, [makeUser()]);
    const [staff, planner] = await seedAccessRoles(db, [
      makeAccessRole({ name: 'Staff' }),
      makeAccessRole({ name: 'Planner', permissionKeys: [VIEW_BOARD, EDIT_ALLOCATIONS] }),
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

/** Every identity row the access roles can touch, for «nothing changed» comparisons. */
const snapshot = () =>
  withDb(async (db) => {
    const roles = await db.execute<{ id: string; name: string; isPreselected: boolean }>(
      `SELECT id, name, is_preselected AS "isPreselected" FROM identity.access_roles ORDER BY id`,
    );
    const grants = await db.execute<{ accessRoleId: string; permissionKey: string }>(
      `SELECT access_role_id AS "accessRoleId", permission_key AS "permissionKey"
       FROM identity.access_role_permissions ORDER BY access_role_id, permission_key`,
    );
    const assignments = await db.execute<{ userId: string; accessRoleId: string }>(
      `SELECT user_id AS "userId", access_role_id AS "accessRoleId"
       FROM identity.user_access_roles ORDER BY user_id, access_role_id`,
    );
    return { roles: roles.rows, grants: grants.rows, assignments: assignments.rows };
  });

const UNKNOWN_ID = '01933b8e-0000-7000-8000-00000000ffff';

const FORBIDDEN = {
  _tag: 'Forbidden',
  code: 'identity.missing_permission',
  message: `You lack the permission ${MANAGE_ACCESS}`,
  details: { missingPermissions: [MANAGE_ACCESS] },
};

const LAST_ADMIN = {
  _tag: 'Conflict',
  code: 'identity.last_admin_required',
  message: 'The intranet must keep at least one admin. Appoint another admin first.',
};

const DUPLICATE_NAME = {
  _tag: 'Conflict',
  code: 'identity.duplicate_access_role_name',
  message: 'An access role with that name already exists',
};

const RETIRED_EDIT = {
  _tag: 'ValidationError',
  code: 'identity.retired_permission',
  message: `A retired permission cannot be added: ${EDIT_ALLOCATIONS}`,
  details: { rules: ['retired_permission'], permissionKeys: [EDIT_ALLOCATIONS] },
};

/** One call per access-role operation, aimed at role `target`. */
const operations = (target: string): Array<[string, string, Call]> => [
  ['listAccessRoles', '/identity/access-roles', {}],
  [
    'createAccessRole',
    '/identity/access-roles',
    { method: 'POST', body: { name: 'New', permissionKeys: [] } },
  ],
  ['getAccessRole', `/identity/access-roles/${target}`, {}],
  [
    'updateAccessRole',
    `/identity/access-roles/${target}`,
    { method: 'PUT', body: { name: 'Renamed', permissionKeys: [] } },
  ],
  ['deleteAccessRole', `/identity/access-roles/${target}`, { method: 'DELETE' }],
  [
    'setPreselectedAccessRole',
    '/identity/preselected-access-role',
    { method: 'PUT', body: { accessRoleId: target } },
  ],
  ['listPermissions', '/identity/permissions', {}],
];

const listRoles = async (token: string, catalog?: ReadonlyArray<PermissionDeclaration>) => {
  const res = await call('/identity/access-roles', { token, catalog });
  expect(res.status).toBe(200);
  return ((await res.json()) as RolePageBody).items;
};

const getRole = async (
  token: string,
  id: string,
  catalog?: ReadonlyArray<PermissionDeclaration>,
) => {
  const res = await call(`/identity/access-roles/${id}`, { token, catalog });
  expect(res.status).toBe(200);
  return (await res.json()) as RoleBody;
};

const putRole = (
  token: string,
  id: string,
  body: unknown,
  catalog?: ReadonlyArray<PermissionDeclaration>,
) => call(`/identity/access-roles/${id}`, { method: 'PUT', token, body, catalog });

const createRole = (token: string, body: unknown, catalog?: ReadonlyArray<PermissionDeclaration>) =>
  call('/identity/access-roles', { method: 'POST', token, body, catalog });

// ---------------------------------------------------------------------------------------------
// Authorization (AC-08 for this tag)

describe('access-role authorization', () => {
  it('refuses every operation to a user without manage access, showing and changing nothing', async () => {
    const { member, roles } = await setup();
    const before = await snapshot();

    for (const [operation, path, init] of operations(roles.planner.id)) {
      const res = await call(path, { ...init, token: member.token });
      expect(res.status, operation).toBe(403);
      expect(await res.json(), operation).toEqual({ error: FORBIDDEN });
    }
    expect(await snapshot()).toEqual(before);
  });

  it('refuses every operation to an anonymous caller with 401', async () => {
    const { roles } = await setup();
    const before = await snapshot();

    for (const [operation, path, init] of operations(roles.planner.id)) {
      const res = await call(path, init);
      expect(res.status, operation).toBe(401);
      expect(await errorOf(res), operation).toMatchObject({ code: 'platform.unauthenticated' });
    }
    expect(await snapshot()).toEqual(before);
  });

  it('is mounted in the api host behind the same guard', async () => {
    const { admin, member } = await setup();

    expect((await callHost('/identity/access-roles')).status).toBe(401);
    const nonAdmin = await callHost('/identity/permissions', { token: member.token });
    expect(nonAdmin.status).toBe(403);
    expect(await nonAdmin.json()).toEqual({ error: FORBIDDEN });

    const listed = await callHost('/identity/access-roles', { token: admin.token });
    expect(listed.status).toBe(200);
    expect(((await listed.json()) as RolePageBody).items).toHaveLength(3);
    const catalog = await callHost('/identity/permissions', { token: admin.token });
    expect(await catalog.json()).toEqual({ items: [manageAccess] });
  });
});

// ---------------------------------------------------------------------------------------------
// AC-09: compose a role from the catalog

describe('AC-09 — compose an access role from declared permissions', () => {
  it('lists every declared permission in plain words', async () => {
    const { admin } = await setup();
    const res = await call('/identity/permissions', { token: admin.token });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [manageAccess, viewBoard, editAllocations] });
  });

  it('creates «Planner» with its permissions in plain words, held by nobody', async () => {
    const { admin } = await setup();
    await withDb((db) => db.execute(`DELETE FROM identity.access_roles WHERE name = 'Planner'`));

    const res = await createRole(admin.token, {
      name: 'Planner',
      permissionKeys: [VIEW_BOARD, EDIT_ALLOCATIONS],
    });

    expect(res.status).toBe(201);
    const created = (await res.json()) as RoleBody;
    expect(created).toMatchObject({
      name: 'Planner',
      isPreselected: false,
      holderCount: 0,
      retiredPermissionKeys: [],
    });
    expect(created.permissions).toEqual(expect.arrayContaining([viewBoard, editAllocations]));
    expect(created.permissions).toHaveLength(2);
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);

    expect(await getRole(admin.token, created.id)).toEqual(created);
    expect((await listRoles(admin.token)).map((role) => role.id)).toContain(created.id);
    expect((await snapshot()).assignments.some((row) => row.accessRoleId === created.id)).toBe(
      false,
    );
  });

  it('lists roles in id order and pages them', async () => {
    const { admin, roles } = await setup();
    const ids = [roles.admin.id, roles.staff.id, roles.planner.id].sort();

    expect((await listRoles(admin.token)).map((role) => role.id)).toEqual(ids);

    const first = await call('/identity/access-roles?limit=2', { token: admin.token });
    const page = (await first.json()) as RolePageBody;
    expect(page.items.map((role) => role.id)).toEqual(ids.slice(0, 2));
    expect(page).toMatchObject({ hasNext: true, hasPrev: false, nextCursor: ids[1] });

    const next = await call(`/identity/access-roles?after=${page.nextCursor}`, {
      token: admin.token,
    });
    const second = (await next.json()) as RolePageBody;
    expect(second.items.map((role) => role.id)).toEqual(ids.slice(2));
    expect(second).toMatchObject({ hasNext: false, hasPrev: true, nextCursor: null });
  });

  it.each([
    ['an unknown body key', { name: 'X', permissionKeys: [], isPreselected: true }],
    ['a malformed key', { name: 'X', permissionKeys: ['scheduling'] }],
    ['an empty name', { name: '', permissionKeys: [] }],
  ])('answers 400 for %s and saves nothing', async (_, body) => {
    const { admin } = await setup();
    const before = await snapshot();
    const res = await createRole(admin.token, body);
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatchObject({ code: 'platform.validation_failed' });
    expect(await snapshot()).toEqual(before);
  });

  it('answers 404 for an unknown role and 400 for a malformed id', async () => {
    const { admin } = await setup();
    const missing = await call(`/identity/access-roles/${UNKNOWN_ID}`, { token: admin.token });
    expect(missing.status).toBe(404);
    expect(await errorOf(missing)).toMatchObject({
      _tag: 'NotFound',
      code: 'identity.access_role_not_found',
    });
    const malformed = await call('/identity/access-roles/42', { token: admin.token });
    expect(malformed.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------
// AC-10: names are unique ignoring case and surrounding spaces

describe('AC-10 — access role names are unique ignoring case', () => {
  it('refuses to create «planner» beside «Planner» and saves nothing', async () => {
    const { admin } = await setup();
    const before = await snapshot();

    const res = await createRole(admin.token, { name: 'PLANNER', permissionKeys: [] });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: DUPLICATE_NAME });
    expect(await snapshot()).toEqual(before);
  });

  it('refuses to rename another role to «planner» and changes nothing', async () => {
    const { admin, roles } = await setup();
    const before = await snapshot();

    const res = await putRole(admin.token, roles.staff.id, { name: 'planner', permissionKeys: [] });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: DUPLICATE_NAME });
    expect(await snapshot()).toEqual(before);
  });

  it('refuses an untrimmed name at the contract (web trims before sending)', async () => {
    const { admin } = await setup();
    const res = await createRole(admin.token, { name: 'planner ', permissionKeys: [] });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toMatchObject({ code: 'platform.validation_failed' });
  });

  it('lets a role keep its own name in another letter case', async () => {
    const { admin, roles } = await setup();
    const res = await putRole(admin.token, roles.planner.id, {
      name: 'PLANNER',
      permissionKeys: [VIEW_BOARD, EDIT_ALLOCATIONS],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'PLANNER' });
  });
});

// ---------------------------------------------------------------------------------------------
// AC-11: change or delete a role its holders depend on

describe('AC-11 — change or delete a held role', () => {
  /** Five users holding «Planner», each with a live session; «Planner» is pre-selected. */
  const withFiveHolders = async () => {
    const context = await setup();
    const holders = await withDb(async (db) => {
      const users = await seedUsers(
        db,
        Array.from({ length: 5 }, () => makeUser()),
      );
      await seedUserAccessRoles(
        db,
        users.map((user) => ({ userId: user.id, accessRoleId: context.roles.planner.id })),
      );
      const sessions = await seedSessions(
        db,
        users.map((user) => makeSession({ userId: user.id })),
      );
      return users.map((user, i) => ({ ...user, token: sessions[i]!.token }));
    });
    await call('/identity/preselected-access-role', {
      method: 'PUT',
      token: context.admin.token,
      body: { accessRoleId: context.roles.planner.id },
    });
    return { ...context, holders };
  };

  const permissionsOf = async (adminToken: string, userId: string) => {
    const res = await call(`/users/${userId}`, { token: adminToken });
    const user = (await res.json()) as { combinedPermissions: PermissionDeclaration[] };
    return user.combinedPermissions.map((permission) => permission.key).sort();
  };

  it('removes edit allocations from every holder from their next request', async () => {
    const { admin, roles, holders } = await withFiveHolders();
    expect(await permissionsOf(admin.token, holders[0]!.id)).toEqual(
      [EDIT_ALLOCATIONS, VIEW_BOARD].sort(),
    );

    const res = await putRole(admin.token, roles.planner.id, {
      name: 'Planner',
      permissionKeys: [VIEW_BOARD],
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ permissions: [viewBoard], holderCount: 5 });
    for (const holder of holders) {
      expect(await permissionsOf(admin.token, holder.id)).toEqual([VIEW_BOARD]);
    }
  });

  it('warns with five holders and the pre-selected mark, then deletes and clears both', async () => {
    const { admin, roles, holders } = await withFiveHolders();

    // The warning web shows before the admin confirms.
    expect(await getRole(admin.token, roles.planner.id)).toMatchObject({
      holderCount: 5,
      isPreselected: true,
    });

    const res = await call(`/identity/access-roles/${roles.planner.id}`, {
      method: 'DELETE',
      token: admin.token,
    });

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    const after = await snapshot();
    expect(after.roles.map((role) => role.id)).not.toContain(roles.planner.id);
    expect(after.roles.some((role) => role.isPreselected)).toBe(false);
    expect(after.grants.some((row) => row.accessRoleId === roles.planner.id)).toBe(false);
    expect(after.assignments.some((row) => row.accessRoleId === roles.planner.id)).toBe(false);
    for (const holder of holders) {
      expect(await permissionsOf(admin.token, holder.id)).toEqual([]);
    }
  });

  it('keeps what another role still grants', async () => {
    const { admin, roles, holders } = await withFiveHolders();
    await withDb((db) =>
      seedUserAccessRoles(db, [{ userId: holders[0]!.id, accessRoleId: roles.admin.id }]),
    );

    await call(`/identity/access-roles/${roles.planner.id}`, {
      method: 'DELETE',
      token: admin.token,
    });

    expect(await permissionsOf(admin.token, holders[0]!.id)).toEqual([MANAGE_ACCESS]);
  });

  it('answers 404 for a role already deleted', async () => {
    const { admin } = await setup();
    const res = await call(`/identity/access-roles/${UNKNOWN_ID}`, {
      method: 'DELETE',
      token: admin.token,
    });
    expect(res.status).toBe(404);
    expect(await errorOf(res)).toMatchObject({ code: 'identity.access_role_not_found' });
  });
});

// ---------------------------------------------------------------------------------------------
// AC-13: the pre-selected role

describe('AC-13 — the pre-selected access role', () => {
  const preselect = (token: string, accessRoleId: string | null) =>
    call('/identity/preselected-access-role', { method: 'PUT', token, body: { accessRoleId } });

  const marked = async (token: string) =>
    (await listRoles(token)).filter((role) => role.isPreselected).map((role) => role.name);

  it('marks at most one role and never changes anyone’s roles', async () => {
    const { admin, roles } = await setup();
    const assignments = (await snapshot()).assignments;

    const staff = await preselect(admin.token, roles.staff.id);
    expect(staff.status).toBe(200);
    expect(await staff.json()).toEqual({ accessRoleId: roles.staff.id });
    expect(await marked(admin.token)).toEqual(['Staff']);

    const planner = await preselect(admin.token, roles.planner.id);
    expect(await planner.json()).toEqual({ accessRoleId: roles.planner.id });
    expect(await marked(admin.token)).toEqual(['Planner']);

    const cleared = await preselect(admin.token, null);
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ accessRoleId: null });
    expect(await marked(admin.token)).toEqual([]);

    expect((await snapshot()).assignments).toEqual(assignments);
  });

  it('refuses a role that no longer exists and keeps the current mark', async () => {
    const { admin, roles } = await setup();
    await preselect(admin.token, roles.staff.id);
    const before = await snapshot();

    const res = await preselect(admin.token, UNKNOWN_ID);

    expect(res.status).toBe(404);
    expect(await errorOf(res)).toMatchObject({ code: 'identity.access_role_not_found' });
    expect(await snapshot()).toEqual(before);
  });

  it('answers 400 for a body without accessRoleId', async () => {
    const { admin } = await setup();
    const res = await call('/identity/preselected-access-role', {
      method: 'PUT',
      token: admin.token,
      body: {},
    });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------
// AC-14: the last admin

describe('AC-14 — the intranet keeps an admin', () => {
  it('refuses to delete «Admin» while it is the only source of manage access', async () => {
    const { admin, member, roles } = await setup();
    // Two admins, both through «Admin».
    await withDb((db) =>
      seedUserAccessRoles(db, [{ userId: member.id, accessRoleId: roles.admin.id }]),
    );
    const before = await snapshot();

    const res = await call(`/identity/access-roles/${roles.admin.id}`, {
      method: 'DELETE',
      token: admin.token,
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: LAST_ADMIN });
    expect(await snapshot()).toEqual(before);
  });

  it('refuses to remove manage access from «Admin» and changes nothing', async () => {
    const { admin, roles } = await setup();
    const before = await snapshot();

    const res = await putRole(admin.token, roles.admin.id, {
      name: 'Admin',
      permissionKeys: [VIEW_BOARD],
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: LAST_ADMIN });
    expect(await snapshot()).toEqual(before);
    expect((await call('/identity/permissions', { token: admin.token })).status).toBe(200);
  });

  it('allows it once another role grants manage access to someone', async () => {
    const { admin, member, roles } = await setup();
    await withDb(async (db) => {
      const [keeper] = await seedAccessRoles(db, [
        makeAccessRole({ name: 'Keeper', permissionKeys: [MANAGE_ACCESS] }),
      ]);
      await seedUserAccessRoles(db, [{ userId: member.id, accessRoleId: keeper!.id }]);
    });

    const res = await call(`/identity/access-roles/${roles.admin.id}`, {
      method: 'DELETE',
      token: admin.token,
    });

    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------------------------
// AC-16: a permission scheduling stops declaring

describe('AC-16 — retired permissions', () => {
  it('flags «Planner», refuses the key elsewhere, lets it be removed, and unflags on re-declare', async () => {
    const { admin, roles } = await setup();

    // Scheduling stops declaring edit allocations: «Planner» is flagged, the key named.
    const flagged = await getRole(admin.token, roles.planner.id, WITHOUT_EDIT);
    expect(flagged).toMatchObject({
      permissions: [viewBoard],
      retiredPermissionKeys: [EDIT_ALLOCATIONS],
    });
    const listed = await listRoles(admin.token, WITHOUT_EDIT);
    expect(
      listed.filter((role) => role.retiredPermissionKeys.length > 0).map((r) => r.name),
    ).toEqual(['Planner']);
    const catalog = await call('/identity/permissions', {
      token: admin.token,
      catalog: WITHOUT_EDIT,
    });
    expect(await catalog.json()).toEqual({ items: [manageAccess, viewBoard] });

    // The retired key can't be added to any role, new or existing.
    const before = await snapshot();
    const created = await createRole(
      admin.token,
      { name: 'Editors', permissionKeys: [EDIT_ALLOCATIONS] },
      WITHOUT_EDIT,
    );
    expect(created.status).toBe(400);
    expect(await created.json()).toEqual({ error: RETIRED_EDIT });
    const added = await putRole(
      admin.token,
      roles.staff.id,
      { name: 'Staff', permissionKeys: [EDIT_ALLOCATIONS] },
      WITHOUT_EDIT,
    );
    expect(added.status).toBe(400);
    expect(await added.json()).toEqual({ error: RETIRED_EDIT });
    expect(await snapshot()).toEqual(before);

    // «Planner» may keep it through a rename...
    const kept = await putRole(
      admin.token,
      roles.planner.id,
      { name: 'Planners', permissionKeys: [VIEW_BOARD, EDIT_ALLOCATIONS] },
      WITHOUT_EDIT,
    );
    expect(kept.status).toBe(200);
    expect(await kept.json()).toMatchObject({
      name: 'Planners',
      retiredPermissionKeys: [EDIT_ALLOCATIONS],
    });

    // ...and scheduling declaring it again clears the flag, the grant intact.
    const redeclared = await getRole(admin.token, roles.planner.id, FULL_CATALOG);
    expect(redeclared.retiredPermissionKeys).toEqual([]);
    expect(redeclared.permissions).toEqual(expect.arrayContaining([viewBoard, editAllocations]));
  });

  it('lets the admin remove the retired key, which clears the flag', async () => {
    const { admin, roles } = await setup();

    const res = await putRole(
      admin.token,
      roles.planner.id,
      { name: 'Planner', permissionKeys: [VIEW_BOARD] },
      WITHOUT_EDIT,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ permissions: [viewBoard], retiredPermissionKeys: [] });
    // Gone for good: re-declaring does not bring it back.
    expect((await getRole(admin.token, roles.planner.id)).permissions).toEqual([viewBoard]);
  });
});
