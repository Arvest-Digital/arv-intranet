import { Actor, CurrentActor, Permission, type UserId } from '@arv/kernel';
import { Effect, Either, Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import type { SessionTokenHash } from '../domain/session';
import { UserName } from '../domain/user';
import { MANAGE_ACCESS } from '../permissions';
import {
  addUser,
  getUser,
  listUsers,
  removeUser,
  renameUser,
  setUserAccessRoles,
} from './access-list';
import { AccessRoleId, AccessRoleRepository, SessionRepository, UserRepository } from './ports';
import { type IdentityFakes, makeIdentityFakes } from './testing';

const VIEW_BOARD = Permission.make('scheduling:view-board');
const EDIT_ALLOCATIONS = Permission.make('scheduling:edit-allocations');
const MANAGE_PEOPLE = Permission.make('people:manage-people');

const name = Schema.decodeSync(UserName);
const hash = (value: string) => value as SessionTokenHash;
const future = new Date('2100-01-01T00:00:00Z');
const unknownId = '01a135e4-c4d9-797e-ad76-ae23c85d58cd';

const setup = () => {
  const fakes = makeIdentityFakes();
  for (const [key, label] of [
    [VIEW_BOARD, 'View the whole board'],
    [EDIT_ALLOCATIONS, 'Edit allocations'],
    [MANAGE_PEOPLE, 'Manage people'],
  ] as const) {
    fakes.declare({ key, name: label, description: `${label}.`, feature: 'Test' });
  }
  const admin = fakes.seedRole({ name: 'Admin', permissionKeys: [MANAGE_ACCESS] });
  const staff = fakes.seedRole({ name: 'Staff', permissionKeys: [VIEW_BOARD] });
  const planner = fakes.seedRole({
    name: 'Planner',
    permissionKeys: [VIEW_BOARD, EDIT_ALLOCATIONS, 'scheduling:retired-key'],
  });
  const peopleAdmin = fakes.seedRole({ name: 'People admin', permissionKeys: [MANAGE_PEOPLE] });
  const ann = fakes.seedUser({ email: 'ann@arvest.digital', name: 'Ann' }, [admin.id]);
  const anna = fakes.seedUser({ email: 'anna@arvest.digital', name: 'Anna Kovalenko' }, [
    staff.id,
    planner.id,
  ]);
  const roles = { admin, staff, planner, peopleAdmin };
  return { fakes, roles, ann, anna };
};

/** The whole store as plain data, so «nothing changed» is one deep comparison. */
const state = (fakes: IdentityFakes) => {
  const snapshot = fakes.snapshot();
  return {
    users: snapshot.users,
    roles: snapshot.roles,
    sessions: snapshot.sessions,
    assignments: snapshot.users.map((user) => [user.id, snapshot.userRoles(user.id)]),
  };
};

type IdentityServices = CurrentActor | Layer.Layer.Success<IdentityFakes['layer']>;

const adminActor = (id: UserId) => Actor.User({ id, permissions: new Set([MANAGE_ACCESS]) });

const run = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  layer: Layer.Layer<Exclude<R, CurrentActor>>,
  actor: Actor,
) =>
  Effect.runPromise(
    Effect.either(effect).pipe(
      Effect.provideService(CurrentActor, actor),
      Effect.provide(layer),
    ) as Effect.Effect<Either.Either<A, E>>,
  );

const tagOf = <A, E extends { _tag: string }>(result: Either.Either<A, E>) =>
  Either.isLeft(result) ? result.left._tag : 'Right';

const permissionKeys = (access: { combinedPermissions: ReadonlyArray<{ key: string }> }) =>
  access.combinedPermissions.map((d) => d.key);

describe('access list: authorization (AC-08)', () => {
  /** Every repository method records its name; nothing is read or written before the check. */
  const spiedLayer = (fakes: IdentityFakes, calls: string[]) => {
    const spy = <T extends object>(port: string, impl: T): T =>
      new Proxy(impl, {
        get: (target, prop, receiver) => {
          const value = Reflect.get(target, prop, receiver);
          if (typeof value !== 'function') return value;
          return (...args: unknown[]) => {
            calls.push(`${port}.${String(prop)}`);
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        },
      });
    return Layer.mergeAll(
      fakes.layer,
      Layer.succeed(UserRepository, spy('users', fakes.users)),
      Layer.succeed(SessionRepository, spy('sessions', fakes.sessions)),
      Layer.succeed(AccessRoleRepository, spy('accessRoles', fakes.accessRoles)),
    );
  };

  const useCases = (ids: {
    ann: UserId;
    role: AccessRoleId;
  }): ReadonlyArray<
    readonly [string, Effect.Effect<unknown, { readonly _tag: string }, IdentityServices>]
  > => [
    ['listUsers', listUsers()],
    ['getUser', getUser(ids.ann)],
    [
      'addUser',
      addUser({ email: 'bob@arvest.digital', name: name('Bob'), accessRoleIds: [ids.role] }),
    ],
    ['renameUser', renameUser(ids.ann, name('Mallory'))],
    ['removeUser', removeUser(ids.ann)],
    ['setUserAccessRoles', setUserAccessRoles(ids.ann, [])],
  ];

  it.each(['listUsers', 'getUser', 'addUser', 'renameUser', 'removeUser', 'setUserAccessRoles'])(
    '%s refuses a caller without manage access before any read',
    async (useCase) => {
      const { fakes, roles, ann, anna } = setup();
      const before = state(fakes);
      const calls: string[] = [];
      const [, effect] = useCases({ ann: ann.id, role: roles.staff.id }).find(
        ([n]) => n === useCase,
      )!;
      const actor = Actor.User({
        id: anna.id,
        permissions: new Set([VIEW_BOARD, EDIT_ALLOCATIONS]),
      });

      const result = await run(effect, spiedLayer(fakes, calls), actor);

      expect(tagOf(result)).toBe('PermissionDenied');
      expect(calls).toEqual([]);
      expect(state(fakes)).toEqual(before);
    },
  );

  it('records the reads an admin makes (the spy above is live)', async () => {
    const { fakes, ann } = setup();
    const calls: string[] = [];
    await run(listUsers(), spiedLayer(fakes, calls), adminActor(ann.id));
    expect(calls).toContain('users.list');
  });

  it('refuses an anonymous caller as unauthenticated before any read', async () => {
    const { fakes } = setup();
    const calls: string[] = [];
    const result = await run(listUsers(), spiedLayer(fakes, calls), Actor.Anonymous());
    expect(tagOf(result)).toBe('Unauthenticated');
    expect(calls).toEqual([]);
  });
});

describe('listUsers / getUser', () => {
  it('lists every user with roles and combined permissions', async () => {
    const { fakes, roles, ann, anna } = setup();
    const result = Either.getOrThrow(await run(listUsers(), fakes.layer, adminActor(ann.id)));
    expect(result.map((entry) => entry.user.id)).toEqual([ann.id, anna.id]);
    expect(result[1]?.accessRoles).toEqual([
      { id: roles.staff.id, name: 'Staff' },
      { id: roles.planner.id, name: 'Planner' },
    ]);
  });

  it('returns one user, or UserNotFound', async () => {
    const { fakes, ann } = setup();
    const found = Either.getOrThrow(await run(getUser(ann.id), fakes.layer, adminActor(ann.id)));
    expect(found.user).toEqual(ann);
    expect(permissionKeys(found)).toEqual([MANAGE_ACCESS]);

    const missing = await run(getUser(unknownId as UserId), fakes.layer, adminActor(ann.id));
    expect(tagOf(missing)).toBe('UserNotFound');
  });
});

describe('addUser', () => {
  it('lists the joiner with exactly the chosen roles (AC-04)', async () => {
    const { fakes, roles, ann } = setup();
    const result = await run(
      addUser({
        email: ' Bob@Arvest.Digital ',
        name: name('  Bob Builder '),
        accessRoleIds: [roles.staff.id, roles.staff.id],
      }),
      fakes.layer,
      adminActor(ann.id),
    );
    const added = Either.getOrThrow(result);
    expect(added.user).toMatchObject({ email: 'bob@arvest.digital', name: 'Bob Builder' });
    expect(added.accessRoles).toEqual([{ id: roles.staff.id, name: 'Staff' }]);
    expect(permissionKeys(added)).toEqual([VIEW_BOARD]);
    expect(fakes.snapshot().userRoles(added.user.id)).toEqual([roles.staff.id]);
  });

  it('adds a user with no roles', async () => {
    const { fakes, ann } = setup();
    const added = Either.getOrThrow(
      await run(
        addUser({ email: 'bob@arvest.digital', name: name('Bob'), accessRoleIds: [] }),
        fakes.layer,
        adminActor(ann.id),
      ),
    );
    expect(added.accessRoles).toEqual([]);
    expect(added.combinedPermissions).toEqual([]);
  });

  it.each([
    'bob@gmail.com',
    'bob@arvest.digital.evil.com',
    'not-an-email',
    '@arvest.digital',
    'bob..smith@arvest.digital',
  ])('refuses %s as not a company address and changes nothing (AC-05)', async (email) => {
    const { fakes, ann } = setup();
    const before = state(fakes);
    const result = await run(
      addUser({ email, name: name('Bob'), accessRoleIds: [] }),
      fakes.layer,
      adminActor(ann.id),
    );
    expect(tagOf(result)).toBe('NotCompanyAddress');
    expect(state(fakes)).toEqual(before);
  });

  it('refuses an address already listed in another letter case (AC-06)', async () => {
    const { fakes, ann } = setup();
    const before = state(fakes);
    const result = await run(
      addUser({ email: 'Anna@Arvest.Digital', name: name('Anna 2'), accessRoleIds: [] }),
      fakes.layer,
      adminActor(ann.id),
    );
    expect(Either.isLeft(result) && result.left).toMatchObject({
      _tag: 'EmailTaken',
      email: 'anna@arvest.digital',
    });
    expect(state(fakes)).toEqual(before);
  });

  it('refuses an unknown role with AccessRoleNotFound and adds nobody', async () => {
    const { fakes, roles, ann } = setup();
    const before = state(fakes);
    const result = await run(
      addUser({
        email: 'bob@arvest.digital',
        name: name('Bob'),
        accessRoleIds: [roles.staff.id, AccessRoleId.make(unknownId)],
      }),
      fakes.layer,
      adminActor(ann.id),
    );
    expect(Either.isLeft(result) && result.left).toMatchObject({
      _tag: 'AccessRoleNotFound',
      id: unknownId,
    });
    expect(state(fakes)).toEqual(before);
  });

  it('runs inside one unit of work', async () => {
    const { fakes, ann } = setup();
    let inTransaction = false;
    const users = Layer.succeed(UserRepository, {
      ...fakes.users,
      create: (input, ids) => {
        inTransaction = fakes.inTransaction();
        return fakes.users.create(input, ids);
      },
    });
    await run(
      addUser({ email: 'bob@arvest.digital', name: name('Bob'), accessRoleIds: [] }),
      Layer.merge(fakes.layer, users),
      adminActor(ann.id),
    );
    expect(inTransaction).toBe(true);
  });
});

describe('renameUser (AC-21)', () => {
  it('changes only the name; roles, email and sessions stay', async () => {
    const { fakes, roles, ann, anna } = setup();
    fakes.seedSession({ tokenHash: hash('anna-laptop'), userId: anna.id, expiresAt: future });

    const result = Either.getOrThrow(
      await run(renameUser(anna.id, name('Anna Koval')), fakes.layer, adminActor(ann.id)),
    );

    expect(result.user).toMatchObject({ id: anna.id, email: anna.email, name: 'Anna Koval' });
    expect(result.accessRoles.map((r) => r.id)).toEqual([roles.staff.id, roles.planner.id]);
    const after = fakes.snapshot();
    expect(after.userRoles(anna.id)).toEqual([roles.staff.id, roles.planner.id]);
    expect(after.sessions).toEqual([
      { tokenHash: 'anna-laptop', userId: anna.id, expiresAt: future, revokedReason: null },
    ]);
  });

  it('fails UserNotFound for a user no longer listed', async () => {
    const { fakes, ann } = setup();
    const result = await run(
      renameUser(unknownId as UserId, name('Ghost')),
      fakes.layer,
      adminActor(ann.id),
    );
    expect(tagOf(result)).toBe('UserNotFound');
  });
});

describe('removeUser (AC-07, AC-14)', () => {
  it('revokes every session as access removed, deletes the user and their roles', async () => {
    const { fakes, ann, anna } = setup();
    fakes.seedSession({ tokenHash: hash('anna-laptop'), userId: anna.id, expiresAt: future });
    fakes.seedSession({ tokenHash: hash('anna-phone'), userId: anna.id, expiresAt: future });
    fakes.seedSession({ tokenHash: hash('ann-laptop'), userId: ann.id, expiresAt: future });

    const result = await run(removeUser(anna.id), fakes.layer, adminActor(ann.id));

    expect(Either.isRight(result)).toBe(true);
    const after = fakes.snapshot();
    expect(after.users.map((u) => u.id)).toEqual([ann.id]);
    expect(after.userRoles(anna.id)).toEqual([]);
    expect(after.sessions).toEqual([
      {
        tokenHash: 'anna-laptop',
        userId: null,
        expiresAt: future,
        revokedReason: 'access-removed',
      },
      { tokenHash: 'anna-phone', userId: null, expiresAt: future, revokedReason: 'access-removed' },
      { tokenHash: 'ann-laptop', userId: ann.id, expiresAt: future, revokedReason: null },
    ]);
  });

  it('re-adding a removed user gives only the roles chosen then (AC-07)', async () => {
    const { fakes, roles, ann, anna } = setup();
    await run(removeUser(anna.id), fakes.layer, adminActor(ann.id));
    const readded = Either.getOrThrow(
      await run(
        addUser({ email: anna.email, name: name('Anna'), accessRoleIds: [roles.staff.id] }),
        fakes.layer,
        adminActor(ann.id),
      ),
    );
    expect(readded.accessRoles.map((r) => r.id)).toEqual([roles.staff.id]);
  });

  it('allows removing an admin while another admin remains', async () => {
    const { fakes, roles, ann } = setup();
    const bob = fakes.seedUser({ email: 'bob@arvest.digital', name: 'Bob' }, [roles.admin.id]);
    const result = await run(removeUser(ann.id), fakes.layer, adminActor(bob.id));
    expect(Either.isRight(result)).toBe(true);
    expect(fakes.snapshot().users.map((u) => u.id)).not.toContain(ann.id);
  });

  it('refuses removing the only admin with LastAdminRequired and changes nothing', async () => {
    const { fakes, ann } = setup();
    fakes.seedSession({ tokenHash: hash('ann-laptop'), userId: ann.id, expiresAt: future });
    const before = state(fakes);

    const result = await run(removeUser(ann.id), fakes.layer, adminActor(ann.id));

    expect(tagOf(result)).toBe('LastAdminRequired');
    expect(state(fakes)).toEqual(before);
  });

  it('fails UserNotFound for an unknown user and changes nothing', async () => {
    const { fakes, ann } = setup();
    const before = state(fakes);
    const result = await run(removeUser(unknownId as UserId), fakes.layer, adminActor(ann.id));
    expect(tagOf(result)).toBe('UserNotFound');
    expect(state(fakes)).toEqual(before);
  });
});

describe('setUserAccessRoles (AC-12, AC-14)', () => {
  it('assigns another role and returns the combined permissions as declarations', async () => {
    const { fakes, roles, ann, anna } = setup();

    // Anna keeps «Staff» and «Planner» (both grant view-the-board) and also gets «People admin».
    const result = Either.getOrThrow(
      await run(
        setUserAccessRoles(anna.id, [roles.staff.id, roles.planner.id, roles.peopleAdmin.id]),
        fakes.layer,
        adminActor(ann.id),
      ),
    );

    expect(result.accessRoles.map((r) => r.name).sort()).toEqual([
      'People admin',
      'Planner',
      'Staff',
    ]);
    // Union of the roles in plain words: declared keys only (the retired key grants nothing),
    // the shared view-the-board key once, in catalog order.
    expect(result.combinedPermissions.map(({ key, name }) => ({ key, name }))).toEqual([
      { key: VIEW_BOARD, name: 'View the whole board' },
      { key: EDIT_ALLOCATIONS, name: 'Edit allocations' },
      { key: MANAGE_PEOPLE, name: 'Manage people' },
    ]);
    expect(fakes.snapshot().userRoles(anna.id).sort()).toEqual(
      [roles.staff.id, roles.planner.id, roles.peopleAdmin.id].sort(),
    );
  });

  it('takes every role away with an empty set', async () => {
    const { fakes, ann, anna } = setup();
    const result = Either.getOrThrow(
      await run(setUserAccessRoles(anna.id, []), fakes.layer, adminActor(ann.id)),
    );
    expect(result.accessRoles).toEqual([]);
    expect(result.combinedPermissions).toEqual([]);
    expect(fakes.snapshot().userRoles(anna.id)).toEqual([]);
  });

  it('refuses taking «Admin» from the only admin with LastAdminRequired, nothing changed', async () => {
    const { fakes, roles, ann } = setup();
    const before = state(fakes);

    const result = await run(
      setUserAccessRoles(ann.id, [roles.staff.id]),
      fakes.layer,
      adminActor(ann.id),
    );

    expect(tagOf(result)).toBe('LastAdminRequired');
    expect(state(fakes)).toEqual(before);
  });

  it('allows taking «Admin» from an admin once another admin exists', async () => {
    const { fakes, roles, ann, anna } = setup();
    await run(
      setUserAccessRoles(anna.id, [roles.admin.id, roles.staff.id]),
      fakes.layer,
      adminActor(ann.id),
    );
    const result = await run(setUserAccessRoles(ann.id, []), fakes.layer, adminActor(ann.id));
    expect(Either.isRight(result)).toBe(true);
    expect(fakes.snapshot().userRoles(ann.id)).toEqual([]);
  });

  it('fails AccessRoleNotFound for a role deleted meanwhile, nothing changed', async () => {
    const { fakes, roles, ann, anna } = setup();
    const before = state(fakes);
    const result = await run(
      setUserAccessRoles(anna.id, [roles.staff.id, AccessRoleId.make(unknownId)]),
      fakes.layer,
      adminActor(ann.id),
    );
    expect(tagOf(result)).toBe('AccessRoleNotFound');
    expect(state(fakes)).toEqual(before);
  });

  it('fails UserNotFound for a user no longer listed', async () => {
    const { fakes, ann } = setup();
    const result = await run(
      setUserAccessRoles(unknownId as UserId, []),
      fakes.layer,
      adminActor(ann.id),
    );
    expect(tagOf(result)).toBe('UserNotFound');
  });
});
