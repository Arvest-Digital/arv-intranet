import { env } from 'cloudflare:test';
import { DatabaseLive } from '@arv/db';
import {
  MANAGE_ACCESS_PERMISSION,
  makeAccessRole,
  makeUser,
  seedAccessRoles,
  seedUserAccessRoles,
  seedUsers,
} from '@arv/db/testing';
import { UserId } from '@arv/kernel';
import { Effect, Either, Layer, Option, Schema } from 'effect';
import { beforeEach, describe, expect, it } from 'vitest';
// The adapter is not exported by @arv/identity (only `.`, `./http`, `./layer`), so it is
// reached by path, like a module-internal test would.
import {
  AccessRoleId,
  AccessRoleRepository,
} from '../../../../../modules/identity/src/application/ports';
import {
  AccessRoleName,
  accessRoleNameKey,
} from '../../../../../modules/identity/src/domain/access-role';
import { AccessRoleNameTaken } from '../../../../../modules/identity/src/domain/errors';
import { DrizzleAccessRoleRepositoryLive } from '../../../../../modules/identity/src/infrastructure/drizzle-access-role-repository';
import { resetDb, withDb } from '../../helpers';

beforeEach(resetDb);

const TestLayer = DrizzleAccessRoleRepositoryLive.pipe(
  Layer.provide(DatabaseLive(env.HYPERDRIVE.connectionString)),
);

type Repo = AccessRoleRepository['Type'];

const run = <A, E>(use: (repo: Repo) => Effect.Effect<A, E>) =>
  Effect.runPromise(Effect.flatMap(AccessRoleRepository, use).pipe(Effect.provide(TestLayer)));

const name = Schema.decodeSync(AccessRoleName);
const role = (roleName: string, permissionKeys: ReadonlyArray<string> = []) => ({
  name: name(roleName),
  permissionKeys,
});

const RETIRED_KEY = 'payroll:export';

describe('DrizzleAccessRoleRepository: create, read, update, delete', () => {
  it('creates a role with its keys, not pre-selected and held by nobody', async () => {
    const created = await run((repo) => repo.create(role('Planner', [MANAGE_ACCESS_PERMISSION])));
    expect(created).toMatchObject({
      name: 'Planner',
      isPreselected: false,
      permissionKeys: [MANAGE_ACCESS_PERMISSION],
      holderCount: 0,
    });
    expect(created.createdAt).toBeInstanceOf(Date);

    expect(await run((repo) => repo.findById(created.id))).toEqual(Option.some(created));
    expect(await run((repo) => repo.findByNameKey(accessRoleNameKey(' PLANNER ')))).toEqual(
      Option.some(created),
    );
  });

  it('refuses «planner » after «Planner» with AccessRoleNameTaken (AC-10)', async () => {
    await run((repo) => repo.create(role('Planner')));

    const result = await run((repo) => Effect.either(repo.create(role('planner '))));

    const error = Either.isLeft(result) ? result.left : undefined;
    expect(error).toBeInstanceOf(AccessRoleNameTaken);
    expect(error?._tag).toBe('AccessRoleNameTaken');
    expect((await run((repo) => repo.list())).map((r) => r.name)).toEqual(['Planner']);
  });

  it('refuses renaming a role onto another role’s name key (AC-10)', async () => {
    const other = await run((repo) => repo.create(role('Reviewer')));
    await run((repo) => repo.create(role('Planner')));

    const result = await run((repo) => Effect.either(repo.update(other.id, role(' PLANNER'))));

    expect(Either.isLeft(result) && result.left).toBeInstanceOf(AccessRoleNameTaken);
  });

  it('lists every role with its keys and distinct holder count', async () => {
    const [ann, bob] = await withDb((db) => seedUsers(db, [makeUser(), makeUser()]));
    const [admins, empty] = await withDb((db) =>
      seedAccessRoles(db, [
        makeAccessRole({ permissionKeys: [MANAGE_ACCESS_PERMISSION, RETIRED_KEY] }),
        makeAccessRole(),
      ]),
    );
    await withDb((db) =>
      seedUserAccessRoles(db, [
        { userId: ann!.id, accessRoleId: admins!.id },
        { userId: bob!.id, accessRoleId: admins!.id },
      ]),
    );

    const list = await run((repo) => repo.list());

    expect(
      list.map((r) => ({ id: r.id, keys: [...r.permissionKeys].sort(), n: r.holderCount })),
    ).toEqual([
      { id: admins!.id, keys: [MANAGE_ACCESS_PERMISSION, RETIRED_KEY].sort(), n: 2 },
      { id: empty!.id, keys: [], n: 0 },
    ]);
  });

  it('lists the roles a user holds', async () => {
    const [ann] = await withDb((db) => seedUsers(db, [makeUser()]));
    const [held, , alsoHeld] = await withDb((db) =>
      seedAccessRoles(db, [makeAccessRole(), makeAccessRole(), makeAccessRole()]),
    );
    await withDb((db) =>
      seedUserAccessRoles(db, [
        { userId: ann!.id, accessRoleId: held!.id },
        { userId: ann!.id, accessRoleId: alsoHeld!.id },
      ]),
    );

    const roles = await run((repo) => repo.listForUser(UserId.make(ann!.id)));

    expect(roles.map((r) => r.id)).toEqual([held!.id, alsoHeld!.id]);
    expect(roles.every((r) => r.holderCount === 1)).toBe(true);
  });

  it('replaces name and key set on update, keeping holders', async () => {
    const [ann] = await withDb((db) => seedUsers(db, [makeUser()]));
    const [seeded] = await withDb((db) =>
      seedAccessRoles(db, [makeAccessRole({ name: 'Planner', permissionKeys: [RETIRED_KEY] })]),
    );
    await withDb((db) => seedUserAccessRoles(db, [{ userId: ann!.id, accessRoleId: seeded!.id }]));
    const id = AccessRoleId.make(seeded!.id);

    const updated = await run((repo) =>
      repo.update(id, role('Lead planner', [MANAGE_ACCESS_PERMISSION, MANAGE_ACCESS_PERMISSION])),
    );

    expect(Option.getOrThrow(updated)).toMatchObject({
      id,
      name: 'Lead planner',
      permissionKeys: [MANAGE_ACCESS_PERMISSION],
      holderCount: 1,
    });

    const cleared = await run((repo) => repo.update(id, role('Lead planner')));
    expect(Option.map(cleared, (r) => r.permissionKeys)).toEqual(Option.some([]));
  });

  it('returns None / false for a role that is gone', async () => {
    const missing = AccessRoleId.make('0195f0c4-0000-7000-8000-000000000001');
    expect(await run((repo) => repo.findById(missing))).toEqual(Option.none());
    expect(await run((repo) => repo.update(missing, role('Planner')))).toEqual(Option.none());
    expect(await run((repo) => repo.delete(missing))).toBe(false);
  });

  it('deletes a role with its grants and assignments: holder count is 0 (AC-11)', async () => {
    const [ann, bob] = await withDb((db) => seedUsers(db, [makeUser(), makeUser()]));
    const [seeded] = await withDb((db) =>
      seedAccessRoles(db, [
        makeAccessRole({ isPreselected: true, permissionKeys: [MANAGE_ACCESS_PERMISSION] }),
      ]),
    );
    await withDb((db) =>
      seedUserAccessRoles(db, [
        { userId: ann!.id, accessRoleId: seeded!.id },
        { userId: bob!.id, accessRoleId: seeded!.id },
      ]),
    );
    const id = AccessRoleId.make(seeded!.id);

    expect(await run((repo) => repo.delete(id))).toBe(true);

    expect(await run((repo) => repo.findById(id))).toEqual(Option.none());
    expect(await run((repo) => repo.countManageAccessHolders())).toBe(0);
    expect(await run((repo) => repo.getPreselected())).toEqual(Option.none());
    const leftovers = await withDb(async (db) => {
      const { rows } = await db.execute<{ grants: number; assignments: number }>(
        `SELECT
           (SELECT count(*)::int FROM identity.access_role_permissions) AS grants,
           (SELECT count(*)::int FROM identity.user_access_roles) AS assignments`,
      );
      return rows[0];
    });
    expect(leftovers).toEqual({ grants: 0, assignments: 0 });
  });
});

describe('DrizzleAccessRoleRepository: the pre-selected mark (AC-13)', () => {
  it('setting a second pre-selected role clears the first', async () => {
    const first = await run((repo) => repo.create(role('First')));
    const second = await run((repo) => repo.create(role('Second')));

    await run((repo) => repo.setPreselected(first.id));
    await run((repo) => repo.setPreselected(second.id));

    const marked = (await run((repo) => repo.list())).filter((r) => r.isPreselected);
    expect(marked.map((r) => r.id)).toEqual([second.id]);
    expect(Option.map(await run((repo) => repo.getPreselected()), (r) => r.id)).toEqual(
      Option.some(second.id),
    );
  });

  it('moves the mark back to an earlier role (row order does not matter)', async () => {
    const first = await run((repo) => repo.create(role('First')));
    const second = await run((repo) => repo.create(role('Second')));
    await run((repo) => repo.setPreselected(second.id));

    await run((repo) => repo.setPreselected(first.id));

    expect(Option.map(await run((repo) => repo.getPreselected()), (r) => r.id)).toEqual(
      Option.some(first.id),
    );
  });

  it('is idempotent and cleared with null, touching no assignment', async () => {
    const [ann] = await withDb((db) => seedUsers(db, [makeUser()]));
    const marked = await run((repo) => repo.create(role('Marked')));
    await withDb((db) => seedUserAccessRoles(db, [{ userId: ann!.id, accessRoleId: marked.id }]));

    await run((repo) => repo.setPreselected(marked.id));
    await run((repo) => repo.setPreselected(marked.id));
    expect(Option.isSome(await run((repo) => repo.getPreselected()))).toBe(true);

    await run((repo) => repo.setPreselected(null));
    expect(await run((repo) => repo.getPreselected())).toEqual(Option.none());
    expect(Option.map(await run((repo) => repo.findById(marked.id)), (r) => r.holderCount)).toEqual(
      Option.some(1),
    );
  });
});

describe('DrizzleAccessRoleRepository: manage-access holders', () => {
  it('counts distinct users across two admin roles (AC-14)', async () => {
    const [ann, bob, cid, dan] = await withDb((db) =>
      seedUsers(db, [makeUser(), makeUser(), makeUser(), makeUser()]),
    );
    const [adminA, adminB, plain, retired] = await withDb((db) =>
      seedAccessRoles(db, [
        makeAccessRole({ permissionKeys: [MANAGE_ACCESS_PERMISSION] }),
        makeAccessRole({ permissionKeys: [MANAGE_ACCESS_PERMISSION, RETIRED_KEY] }),
        makeAccessRole(),
        makeAccessRole({ permissionKeys: [RETIRED_KEY] }),
      ]),
    );
    await withDb((db) =>
      seedUserAccessRoles(db, [
        // Ann holds both admin roles: counted once.
        { userId: ann!.id, accessRoleId: adminA!.id },
        { userId: ann!.id, accessRoleId: adminB!.id },
        { userId: bob!.id, accessRoleId: adminB!.id },
        { userId: cid!.id, accessRoleId: plain!.id },
        { userId: dan!.id, accessRoleId: retired!.id },
      ]),
    );

    expect(await run((repo) => repo.countManageAccessHolders())).toBe(2);
  });

  it('is 0 when nobody holds manage access', async () => {
    await run((repo) => repo.create(role('Admin', [MANAGE_ACCESS_PERMISSION])));
    expect(await run((repo) => repo.countManageAccessHolders())).toBe(0);
  });

  it('lists admins with name and email only (AC-03)', async () => {
    const [ann, bob, cid] = await withDb((db) =>
      seedUsers(db, [
        makeUser({ name: 'Test User Ann', email: 'ann@example.test' }),
        makeUser({ name: 'Test User Bob', email: 'bob@example.test' }),
        makeUser({ name: 'Test User Cid', email: 'cid@example.test' }),
      ]),
    );
    const [adminA, adminB, plain] = await withDb((db) =>
      seedAccessRoles(db, [
        makeAccessRole({ permissionKeys: [MANAGE_ACCESS_PERMISSION] }),
        makeAccessRole({ permissionKeys: [MANAGE_ACCESS_PERMISSION] }),
        makeAccessRole(),
      ]),
    );
    await withDb((db) =>
      seedUserAccessRoles(db, [
        { userId: ann!.id, accessRoleId: adminA!.id },
        { userId: ann!.id, accessRoleId: adminB!.id },
        { userId: bob!.id, accessRoleId: adminB!.id },
        { userId: cid!.id, accessRoleId: plain!.id },
      ]),
    );

    const admins = await run((repo) => repo.listAdmins());

    expect(admins).toEqual([
      { name: 'Test User Ann', email: 'ann@example.test' },
      { name: 'Test User Bob', email: 'bob@example.test' },
    ]);
    for (const admin of admins) expect(Object.keys(admin).sort()).toEqual(['email', 'name']);
  });
});

describe('DrizzleAccessRoleRepository: ensureAdminRole (AC-15)', () => {
  it('reuses an existing «admin» role and adds manage access to it', async () => {
    const [ann] = await withDb((db) => seedUsers(db, [makeUser()]));
    const [existing] = await withDb((db) =>
      seedAccessRoles(db, [makeAccessRole({ name: ' admin', permissionKeys: [RETIRED_KEY] })]),
    );
    await withDb((db) =>
      seedUserAccessRoles(db, [{ userId: ann!.id, accessRoleId: existing!.id }]),
    );

    const ensured = await run((repo) => repo.ensureAdminRole());

    expect(ensured.id).toBe(existing!.id);
    expect(ensured.name).toBe(' admin');
    expect([...ensured.permissionKeys].sort()).toEqual(
      [MANAGE_ACCESS_PERMISSION, RETIRED_KEY].sort(),
    );
    expect(await run((repo) => repo.list())).toHaveLength(1);
    expect(await run((repo) => repo.countManageAccessHolders())).toBe(1);
  });

  it('creates «Admin» with manage access when there is none, and is idempotent', async () => {
    const created = await run((repo) => repo.ensureAdminRole());
    expect(created).toMatchObject({
      name: 'Admin',
      isPreselected: false,
      permissionKeys: [MANAGE_ACCESS_PERMISSION],
    });

    const again = await run((repo) => repo.ensureAdminRole());
    expect(again).toEqual(created);
    expect(await run((repo) => repo.list())).toHaveLength(1);
  });
});
