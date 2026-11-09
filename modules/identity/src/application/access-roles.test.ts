import {
  Actor,
  CurrentActor,
  Permission,
  type PermissionDeclaration,
  PermissionDenied,
  Unauthenticated,
  type UserId,
} from '@arv/kernel';
import { Effect, Either, type Layer, Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { AccessRoleName } from '../domain/access-role';
import {
  AccessRoleNameTaken,
  AccessRoleNotFound,
  LastAdminRequired,
  RetiredPermissionNotAssignable,
} from '../domain/errors';
import type { SessionTokenHash } from '../domain/session';
import { identityPermissions, MANAGE_ACCESS } from '../permissions';
import {
  createAccessRole,
  deleteAccessRole,
  getAccessRole,
  listAccessRoles,
  setPreselectedAccessRole,
  updateAccessRole,
} from './access-roles';
import { listPermissions } from './list-permissions';
import { AccessRoleId } from './ports';
import { type IdentityFakes, makeIdentityFakes } from './testing';

const VIEW_BOARD = Permission.make('scheduling:view-board');
const EDIT_ALLOCATIONS = Permission.make('scheduling:edit-allocations');

const viewBoard: PermissionDeclaration = {
  key: VIEW_BOARD,
  name: 'View the whole board',
  description: 'See every allocation on the schedule board.',
  feature: 'Resource scheduling',
};
const editAllocations: PermissionDeclaration = {
  key: EDIT_ALLOCATIONS,
  name: 'Edit allocations',
  description: 'Create, change and remove allocations on the schedule board.',
  feature: 'Resource scheduling',
};
const manageAccess = identityPermissions[0] as PermissionDeclaration;

const name = Schema.decodeSync(AccessRoleName);
const unknownRoleId = AccessRoleId.make('01a135e4-c4d9-797e-ad76-ae23c85d58cd');

/** An admin «Ann» holding «Admin» (manage access only) and the scheduling catalog. */
const setup = () => {
  const fakes = makeIdentityFakes({
    declarations: [...identityPermissions, viewBoard, editAllocations],
  });
  const adminRole = fakes.seedRole({ name: 'Admin', permissionKeys: [MANAGE_ACCESS] });
  const ann = fakes.seedUser({ email: 'ann@arvest.digital', name: 'Ann' }, [adminRole.id]);
  return { fakes, adminRole, ann };
};

const asAdmin = (id: UserId) => Actor.User({ id, permissions: new Set([MANAGE_ACCESS]) });

type FakeContext = Layer.Layer.Success<IdentityFakes['layer']> | CurrentActor;

/** Runs a use case as `actor` against the fakes. */
const as =
  (fakes: IdentityFakes, actor: Actor) =>
  <A, E>(effect: Effect.Effect<A, E, FakeContext>): Promise<Either.Either<A, E>> =>
    Effect.runPromise(
      Effect.either(
        effect.pipe(Effect.provide(fakes.layer), Effect.provideService(CurrentActor, actor)),
      ),
    );

/** The whole store as plain data, for «nothing changed» assertions. */
const state = (fakes: IdentityFakes) => {
  const { users, roles, sessions, userRoles } = fakes.snapshot();
  return { users, roles, sessions, assignments: users.map((user) => userRoles(user.id)) };
};

const grantedKeys = async (fakes: IdentityFakes, userId: UserId, hash: string) => {
  fakes.seedSession({
    tokenHash: hash as SessionTokenHash,
    userId,
    expiresAt: new Date(8.64e15),
  });
  const resolved = await Effect.runPromise(fakes.sessions.resolve(hash as SessionTokenHash));
  return Option.getOrThrow(resolved).grantedKeys;
};

describe('manage access is required (AC-08)', () => {
  const { fakes, adminRole, ann } = setup();
  const someone = fakes.seedUser({ email: 'bob@arvest.digital', name: 'Bob' });
  const useCases: Record<string, Effect.Effect<unknown, unknown, FakeContext>> = {
    listAccessRoles: listAccessRoles(),
    getAccessRole: getAccessRole(adminRole.id),
    createAccessRole: createAccessRole({ name: name('Planner'), permissionKeys: [] }),
    updateAccessRole: updateAccessRole(adminRole.id, { name: name('Admin'), permissionKeys: [] }),
    deleteAccessRole: deleteAccessRole(adminRole.id),
    setPreselectedAccessRole: setPreselectedAccessRole(adminRole.id),
    listPermissions: listPermissions(),
  };

  it.each(Object.entries(useCases))('%s refuses a user without manage access', async (_, uc) => {
    const before = state(fakes);
    const result = await as(fakes, Actor.User({ id: someone.id, permissions: new Set() }))(uc);
    expect(result).toEqual(Either.left(new PermissionDenied({ permission: MANAGE_ACCESS })));
    expect(state(fakes)).toEqual(before);
  });

  it.each(Object.entries(useCases))('%s refuses an anonymous actor', async (_, uc) => {
    const result = await as(fakes, Actor.Anonymous())(uc);
    expect(Either.isLeft(result) && result.left).toBeInstanceOf(Unauthenticated);
  });

  it('lets the admin through', async () => {
    expect(Either.isRight(await as(fakes, asAdmin(ann.id))(listAccessRoles()))).toBe(true);
  });
});

describe('listPermissions (AC-09)', () => {
  it('returns every declared permission in plain words', async () => {
    const { fakes, ann } = setup();
    const result = await as(fakes, asAdmin(ann.id))(listPermissions());
    expect(Either.getOrThrow(result)).toEqual([manageAccess, viewBoard, editAllocations]);
  });
});

describe('createAccessRole', () => {
  it('saves «Planner» with its permissions in plain words, held by nobody (AC-09)', async () => {
    const { fakes, ann } = setup();
    const admin = as(fakes, asAdmin(ann.id));
    const created = Either.getOrThrow(
      await admin(
        createAccessRole({ name: name('Planner'), permissionKeys: [VIEW_BOARD, EDIT_ALLOCATIONS] }),
      ),
    );
    expect(created).toMatchObject({
      name: 'Planner',
      isPreselected: false,
      holderCount: 0,
      permissions: [viewBoard, editAllocations],
      retiredPermissionKeys: [],
    });
    const listed = Either.getOrThrow(await admin(listAccessRoles()));
    expect(listed.find((role) => role.id === created.id)).toEqual(created);
  });

  it('refuses «planner » when «Planner» exists (AC-10)', async () => {
    const { fakes, ann } = setup();
    fakes.seedRole({ name: 'Planner' });
    const before = state(fakes);
    const result = await as(
      fakes,
      asAdmin(ann.id),
    )(createAccessRole({ name: name('planner '), permissionKeys: [] }));
    expect(Either.isLeft(result) && result.left).toBeInstanceOf(AccessRoleNameTaken);
    expect(state(fakes)).toEqual(before);
  });

  it('refuses a key no module declares (AC-16)', async () => {
    const { fakes, ann } = setup();
    fakes.retire(EDIT_ALLOCATIONS);
    const result = await as(
      fakes,
      asAdmin(ann.id),
    )(createAccessRole({ name: name('Planner'), permissionKeys: [VIEW_BOARD, EDIT_ALLOCATIONS] }));
    expect(result).toEqual(
      Either.left(new RetiredPermissionNotAssignable({ keys: [EDIT_ALLOCATIONS] })),
    );
    expect(fakes.snapshot().roles.map((role) => role.name)).toEqual(['Admin']);
  });
});

describe('updateAccessRole', () => {
  it('refuses renaming another role to «planner » (AC-10)', async () => {
    const { fakes, ann } = setup();
    fakes.seedRole({ name: 'Planner' });
    const staff = fakes.seedRole({ name: 'Staff' });
    const result = await as(
      fakes,
      asAdmin(ann.id),
    )(updateAccessRole(staff.id, { name: name('planner '), permissionKeys: [] }));
    expect(Either.isLeft(result) && result.left).toBeInstanceOf(AccessRoleNameTaken);
  });

  it('renames a role, keeping its own name key free for itself', async () => {
    const { fakes, ann } = setup();
    const planner = fakes.seedRole({ name: 'Planner' });
    const result = await as(
      fakes,
      asAdmin(ann.id),
    )(updateAccessRole(planner.id, { name: name('PLANNER'), permissionKeys: [VIEW_BOARD] }));
    expect(Either.getOrThrow(result)).toMatchObject({ name: 'PLANNER', permissions: [viewBoard] });
  });

  it('takes edit allocations away from all five holders of «Planner» (AC-11)', async () => {
    const { fakes, ann } = setup();
    const planner = fakes.seedRole({
      name: 'Planner',
      permissionKeys: [VIEW_BOARD, EDIT_ALLOCATIONS],
    });
    const editors = fakes.seedRole({ name: 'Editors', permissionKeys: [EDIT_ALLOCATIONS] });
    const holders = [1, 2, 3, 4, 5].map((n) =>
      fakes.seedUser(
        { email: `p${n}@arvest.digital`, name: `P${n}` },
        n === 5 ? [planner.id, editors.id] : [planner.id],
      ),
    );
    const result = await as(
      fakes,
      asAdmin(ann.id),
    )(updateAccessRole(planner.id, { name: name('Planner'), permissionKeys: [VIEW_BOARD] }));
    expect(Either.getOrThrow(result)).toMatchObject({ holderCount: 5, permissions: [viewBoard] });
    for (const [i, holder] of holders.entries()) {
      const keys = await grantedKeys(fakes, holder.id, `h${i}`);
      expect(keys).toContain(VIEW_BOARD);
      // The fifth also holds «Editors», which still grants it.
      expect(keys.includes(EDIT_ALLOCATIONS)).toBe(i === 4);
    }
  });

  it('refuses removing manage access from «Admin» when it is the only source of admins (AC-14)', async () => {
    const { fakes, adminRole, ann } = setup();
    fakes.seedUser({ email: 'cat@arvest.digital', name: 'Cat' }, [adminRole.id]);
    const before = state(fakes);
    const result = await as(
      fakes,
      asAdmin(ann.id),
    )(updateAccessRole(adminRole.id, { name: name('Admin'), permissionKeys: [VIEW_BOARD] }));
    expect(result).toEqual(Either.left(new LastAdminRequired()));
    expect(state(fakes)).toEqual(before);
    expect(fakes.inTransaction()).toBe(false);
  });

  it('removes manage access from «Admin» when another role keeps an admin (AC-14)', async () => {
    const { fakes, adminRole, ann } = setup();
    const owners = fakes.seedRole({ name: 'Owners', permissionKeys: [MANAGE_ACCESS] });
    fakes.seedUser({ email: 'cat@arvest.digital', name: 'Cat' }, [owners.id]);
    const result = await as(
      fakes,
      asAdmin(ann.id),
    )(updateAccessRole(adminRole.id, { name: name('Admin'), permissionKeys: [] }));
    expect(Either.getOrThrow(result).permissions).toEqual([]);
  });

  it('fails AccessRoleNotFound for a role that is gone', async () => {
    const { fakes, ann } = setup();
    const result = await as(
      fakes,
      asAdmin(ann.id),
    )(updateAccessRole(unknownRoleId, { name: name('Gone'), permissionKeys: [] }));
    expect(result).toEqual(Either.left(new AccessRoleNotFound({ id: unknownRoleId })));
  });
});

describe('retired permissions (AC-16)', () => {
  const retiredSetup = () => {
    const base = setup();
    const planner = base.fakes.seedRole({
      name: 'Planner',
      permissionKeys: [VIEW_BOARD, EDIT_ALLOCATIONS],
    });
    const holder = base.fakes.seedUser({ email: 'pat@arvest.digital', name: 'Pat' }, [planner.id]);
    base.fakes.retire(EDIT_ALLOCATIONS);
    return { ...base, planner, holder, admin: as(base.fakes, asAdmin(base.ann.id)) };
  };

  it('flags «Planner» naming the retired key, which is not labelled as a permission', async () => {
    const { planner, admin } = retiredSetup();
    const listed = Either.getOrThrow(await admin(listAccessRoles()));
    expect(listed.find((role) => role.id === planner.id)).toMatchObject({
      permissions: [viewBoard],
      retiredPermissionKeys: [EDIT_ALLOCATIONS],
    });
    expect(Either.getOrThrow(await admin(getAccessRole(planner.id))).retiredPermissionKeys).toEqual(
      [EDIT_ALLOCATIONS],
    );
  });

  it('lets the role keep the retired key on a rename', async () => {
    const { planner, admin } = retiredSetup();
    const result = await admin(
      updateAccessRole(planner.id, {
        name: name('Planners'),
        permissionKeys: [VIEW_BOARD, EDIT_ALLOCATIONS],
      }),
    );
    expect(Either.getOrThrow(result)).toMatchObject({
      name: 'Planners',
      retiredPermissionKeys: [EDIT_ALLOCATIONS],
    });
  });

  it('refuses adding the retired key to another role', async () => {
    const { fakes, admin } = retiredSetup();
    const staff = fakes.seedRole({ name: 'Staff', permissionKeys: [VIEW_BOARD] });
    const result = await admin(
      updateAccessRole(staff.id, {
        name: name('Staff'),
        permissionKeys: [VIEW_BOARD, EDIT_ALLOCATIONS],
      }),
    );
    expect(result).toEqual(
      Either.left(new RetiredPermissionNotAssignable({ keys: [EDIT_ALLOCATIONS] })),
    );
  });

  it('removes the retired key, clearing the flag', async () => {
    const { planner, admin } = retiredSetup();
    const result = await admin(
      updateAccessRole(planner.id, { name: name('Planner'), permissionKeys: [VIEW_BOARD] }),
    );
    expect(Either.getOrThrow(result).retiredPermissionKeys).toEqual([]);
  });

  it('a re-declared key loses its flag and the role grants it again', async () => {
    const { fakes, planner, holder, admin } = retiredSetup();
    fakes.declare(editAllocations);
    const role = Either.getOrThrow(await admin(getAccessRole(planner.id)));
    expect(role).toMatchObject({
      permissions: [viewBoard, editAllocations],
      retiredPermissionKeys: [],
    });
    const keys = await grantedKeys(fakes, holder.id, 'pat');
    expect(keys.filter(fakes.catalog.isDeclared)).toContain(EDIT_ALLOCATIONS);
  });
});

describe('getAccessRole and deleteAccessRole (AC-11)', () => {
  const plannerSetup = () => {
    const base = setup();
    const planner = base.fakes.seedRole({
      name: 'Planner',
      permissionKeys: [EDIT_ALLOCATIONS],
      isPreselected: true,
    });
    const holders = [1, 2, 3, 4, 5].map((n) =>
      base.fakes.seedUser({ email: `p${n}@arvest.digital`, name: `P${n}` }, [planner.id]),
    );
    return { ...base, planner, holders, admin: as(base.fakes, asAdmin(base.ann.id)) };
  };

  it('warns that five users hold «Planner» and that it is pre-selected', async () => {
    const { planner, admin } = plannerSetup();
    const warning = Either.getOrThrow(await admin(getAccessRole(planner.id)));
    expect(warning).toMatchObject({ holderCount: 5, isPreselected: true });
  });

  it('deletes the role and its assignments, and afterwards no role is marked', async () => {
    const { fakes, planner, holders, admin } = plannerSetup();
    expect(Either.isRight(await admin(deleteAccessRole(planner.id)))).toBe(true);
    const after = fakes.snapshot();
    expect(after.roles.map((role) => role.name)).toEqual(['Admin']);
    for (const holder of holders) expect(after.userRoles(holder.id)).toEqual([]);
    expect(Option.isNone(await Effect.runPromise(fakes.accessRoles.getPreselected()))).toBe(true);
    const listed = Either.getOrThrow(await admin(listAccessRoles()));
    expect(listed.some((role) => role.isPreselected)).toBe(false);
  });

  it('fails AccessRoleNotFound for a role that is gone', async () => {
    const { admin } = plannerSetup();
    expect(await admin(getAccessRole(unknownRoleId))).toEqual(
      Either.left(new AccessRoleNotFound({ id: unknownRoleId })),
    );
    expect(await admin(deleteAccessRole(unknownRoleId))).toEqual(
      Either.left(new AccessRoleNotFound({ id: unknownRoleId })),
    );
  });
});

describe('deleteAccessRole and the last admin (AC-14)', () => {
  it('refuses deleting «Admin» while it is the only source of admins, changing nothing', async () => {
    const { fakes, adminRole, ann } = setup();
    fakes.seedUser({ email: 'cat@arvest.digital', name: 'Cat' }, [adminRole.id]);
    const before = state(fakes);
    const result = await as(fakes, asAdmin(ann.id))(deleteAccessRole(adminRole.id));
    expect(result).toEqual(Either.left(new LastAdminRequired()));
    expect(state(fakes)).toEqual(before);
  });

  it('deletes «Admin» when another role keeps an admin', async () => {
    const { fakes, adminRole, ann } = setup();
    const owners = fakes.seedRole({ name: 'Owners', permissionKeys: [MANAGE_ACCESS] });
    fakes.seedUser({ email: 'cat@arvest.digital', name: 'Cat' }, [owners.id]);
    expect(Either.isRight(await as(fakes, asAdmin(ann.id))(deleteAccessRole(adminRole.id)))).toBe(
      true,
    );
    expect(fakes.snapshot().roles.map((role) => role.name)).toEqual(['Owners']);
  });
});

describe('setPreselectedAccessRole (AC-13)', () => {
  it('moves the single mark from «Staff» to «Planner», then clears it, changing nobody’s roles', async () => {
    const { fakes, ann } = setup();
    const staff = fakes.seedRole({ name: 'Staff', isPreselected: true });
    const planner = fakes.seedRole({ name: 'Planner' });
    const bob = fakes.seedUser({ email: 'bob@arvest.digital', name: 'Bob' }, [staff.id]);
    const admin = as(fakes, asAdmin(ann.id));
    const marked = (roles: ReadonlyArray<{ name: string; isPreselected: boolean }>) =>
      roles.filter((role) => role.isPreselected).map((role) => role.name);

    expect(marked(Either.getOrThrow(await admin(listAccessRoles())))).toEqual(['Staff']);

    expect(await admin(setPreselectedAccessRole(planner.id))).toEqual(
      Either.right({ accessRoleId: planner.id }),
    );
    expect(marked(Either.getOrThrow(await admin(listAccessRoles())))).toEqual(['Planner']);

    expect(await admin(setPreselectedAccessRole(null))).toEqual(
      Either.right({ accessRoleId: null }),
    );
    expect(marked(Either.getOrThrow(await admin(listAccessRoles())))).toEqual([]);
    expect(fakes.snapshot().userRoles(bob.id)).toEqual([staff.id]);
  });

  it('fails AccessRoleNotFound for a role that is gone, keeping the mark', async () => {
    const { fakes, ann } = setup();
    const staff = fakes.seedRole({ name: 'Staff', isPreselected: true });
    const result = await as(fakes, asAdmin(ann.id))(setPreselectedAccessRole(unknownRoleId));
    expect(result).toEqual(Either.left(new AccessRoleNotFound({ id: unknownRoleId })));
    const preselected = await Effect.runPromise(fakes.accessRoles.getPreselected());
    expect(Option.map(preselected, (role) => role.id)).toEqual(Option.some(staff.id));
  });
});
