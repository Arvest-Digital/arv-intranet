import { Actor, Permission, Unauthenticated } from '@arv/kernel';
import { Cause, Effect, Exit, Layer, Option, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { AccessRoleName } from '../domain/access-role';
import { hashSessionToken } from '../domain/session';
import { MANAGE_ACCESS } from '../permissions';
import { IdentityApi, IdentityApiLive } from './identity-api';
import { AccessRoleRepository, SessionRepository } from './ports';
import { resolveActor } from './resolve-actor';
import { type IdentityFakes, makeIdentityFakes } from './testing';

const EDIT_ALLOCATIONS = Permission.make('scheduling:edit-allocations');
const editAllocations = {
  key: EDIT_ALLOCATIONS,
  name: 'Edit allocations',
  description: 'Change who works on what.',
  feature: 'Scheduling',
};
const declarations = [
  {
    key: MANAGE_ACCESS,
    name: 'Manage access',
    description: 'Manage the access list and access roles.',
    feature: 'Access',
  },
  editAllocations,
];

const DAY = 24 * 60 * 60 * 1000;
const inOneDay = () => new Date(Date.now() + DAY);

const seedSession = async (
  fakes: IdentityFakes,
  token: string,
  input: {
    userId: Parameters<IdentityFakes['seedSession']>[0]['userId'];
    expiresAt?: Date;
    revokedReason?: 'access-removed';
  },
) =>
  fakes.seedSession({
    tokenHash: await Effect.runPromise(hashSessionToken(token)),
    userId: input.userId,
    expiresAt: input.expiresAt ?? inOneDay(),
    revokedReason: input.revokedReason ?? null,
  });

const run = (fakes: IdentityFakes, token: Option.Option<string>, layer = fakes.layer) =>
  Effect.runPromiseExit(resolveActor(token).pipe(Effect.provide(layer)));

const resolve = async (fakes: IdentityFakes, token: string) => {
  const exit = await run(fakes, Option.some(token));
  if (Exit.isFailure(exit)) throw new Error(`unexpected failure: ${Cause.pretty(exit.cause)}`);
  return exit.value;
};

const permissionsOf = (actor: Actor) =>
  Actor.$match(actor, {
    Anonymous: () => {
      throw new Error('expected a signed-in user, got Anonymous');
    },
    User: ({ permissions }) => [...permissions].sort(),
  });

describe('resolveActor', () => {
  it('no token → Anonymous, without reading sessions', async () => {
    const fakes = makeIdentityFakes({ declarations });
    const failing = Layer.merge(
      fakes.layer,
      Layer.succeed(SessionRepository, {
        ...fakes.sessions,
        resolve: () => Effect.dieMessage('must not be called'),
      }),
    );
    const exit = await run(fakes, Option.none(), failing);
    expect(exit).toEqual(Exit.succeed(Actor.Anonymous()));
  });

  it('unknown token → Anonymous', async () => {
    const fakes = makeIdentityFakes({ declarations });
    expect(await resolve(fakes, 'nobody-has-this')).toEqual(Actor.Anonymous());
  });

  it('expired session → Anonymous (absolute 7-day expiry)', async () => {
    const fakes = makeIdentityFakes({ declarations });
    const user = fakes.seedUser({ email: 'ann@arvest.digital', name: 'Ann' });
    await seedSession(fakes, 'old', { userId: user.id, expiresAt: new Date(Date.now() - 1000) });
    expect(await resolve(fakes, 'old')).toEqual(Actor.Anonymous());
  });

  it('revoked session → Unauthenticated with access-removed, even past expiry (AC-07)', async () => {
    const fakes = makeIdentityFakes({ declarations });
    await seedSession(fakes, 'removed', { userId: null, revokedReason: 'access-removed' });
    await seedSession(fakes, 'removed-old', {
      userId: null,
      expiresAt: new Date(0),
      revokedReason: 'access-removed',
    });
    for (const token of ['removed', 'removed-old']) {
      expect(await run(fakes, Option.some(token))).toEqual(
        Exit.fail(new Unauthenticated({ reason: 'access-removed' })),
      );
    }
  });

  it('active session → User with id and granted ∩ catalog', async () => {
    const fakes = makeIdentityFakes({ declarations });
    const planner = fakes.seedRole({ name: 'Planner', permissionKeys: [EDIT_ALLOCATIONS] });
    const user = fakes.seedUser({ email: 'bob@arvest.digital', name: 'Bob' }, [planner.id]);
    await seedSession(fakes, 'bob', { userId: user.id });

    const actor = await resolve(fakes, 'bob');
    expect(actor).toEqual(Actor.User({ id: user.id, permissions: new Set([EDIT_ALLOCATIONS]) }));
  });

  it('a retired key held by a role is not in the actor’s set (AC-16, AC-18)', async () => {
    const fakes = makeIdentityFakes({ declarations });
    const role = fakes.seedRole({
      name: 'Planner',
      permissionKeys: [EDIT_ALLOCATIONS, 'scheduling:never-declared'],
    });
    const user = fakes.seedUser({ email: 'bob@arvest.digital', name: 'Bob' }, [role.id]);
    await seedSession(fakes, 'bob', { userId: user.id });

    expect(permissionsOf(await resolve(fakes, 'bob'))).toEqual([EDIT_ALLOCATIONS]);

    fakes.retire(EDIT_ALLOCATIONS);
    expect(permissionsOf(await resolve(fakes, 'bob'))).toEqual([]);

    // Declared again under the same key, it grants again.
    fakes.declare(editAllocations);
    expect(permissionsOf(await resolve(fakes, 'bob'))).toEqual([EDIT_ALLOCATIONS]);
  });

  it('a role change is seen by the next resolve, nothing is cached (AC-17)', async () => {
    const fakes = makeIdentityFakes({ declarations });
    const role = fakes.seedRole({ name: 'Planner', permissionKeys: [EDIT_ALLOCATIONS] });
    const user = fakes.seedUser({ email: 'bob@arvest.digital', name: 'Bob' }, [role.id]);
    await seedSession(fakes, 'bob', { userId: user.id });
    expect(permissionsOf(await resolve(fakes, 'bob'))).toEqual([EDIT_ALLOCATIONS]);

    // The role loses its key.
    await Effect.runPromise(
      Effect.flatMap(AccessRoleRepository, (roles) =>
        roles.update(role.id, {
          name: Schema.decodeSync(AccessRoleName)('Planner'),
          permissionKeys: [],
        }),
      ).pipe(Effect.provide(fakes.layer)),
    );
    expect(permissionsOf(await resolve(fakes, 'bob'))).toEqual([]);

    // The user is given another role.
    const admin = fakes.seedRole({ name: 'Admin', permissionKeys: [MANAGE_ACCESS] });
    await Effect.runPromise(fakes.users.setAccessRoles(user.id, [role.id, admin.id]));
    expect(permissionsOf(await resolve(fakes, 'bob'))).toEqual([MANAGE_ACCESS]);
  });

  it('manage access alone yields exactly {identity:manage-access} (AC-19)', async () => {
    const fakes = makeIdentityFakes({ declarations });
    const admin = fakes.seedRole({ name: 'Admin', permissionKeys: [MANAGE_ACCESS] });
    const user = fakes.seedUser({ email: 'ann@arvest.digital', name: 'Ann' }, [admin.id]);
    await seedSession(fakes, 'ann', { userId: user.id });

    expect(permissionsOf(await resolve(fakes, 'ann'))).toEqual([MANAGE_ACCESS]);
  });

  it('a failing SessionRepository is a defect, never Anonymous (QG-1 fail closed)', async () => {
    const fakes = makeIdentityFakes({ declarations });
    const failing = Layer.merge(
      fakes.layer,
      Layer.succeed(SessionRepository, {
        ...fakes.sessions,
        resolve: () => Effect.dieMessage('connection refused'),
      }),
    );
    const exit = await run(fakes, Option.some('any'), failing);
    expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true);
    expect(Exit.isFailure(exit) && Cause.isFailType(exit.cause)).toBe(false);
  });
});

describe('IdentityApiLive', () => {
  const viaFacade = (layer: Layer.Layer<IdentityApi>, token: string) =>
    Effect.runPromiseExit(
      Effect.flatMap(IdentityApi, (api) => api.resolveActor(Option.some(token))).pipe(
        Effect.provide(layer),
      ),
    );

  it('resolves through the real use case, not the anonymous stub', async () => {
    const fakes = makeIdentityFakes({ declarations });
    const admin = fakes.seedRole({ name: 'Admin', permissionKeys: [MANAGE_ACCESS] });
    const user = fakes.seedUser({ email: 'ann@arvest.digital', name: 'Ann' }, [admin.id]);
    await seedSession(fakes, 'ann', { userId: user.id });

    const exit = await viaFacade(IdentityApiLive.pipe(Layer.provide(fakes.layer)), 'ann');
    expect(exit).toEqual(
      Exit.succeed(Actor.User({ id: user.id, permissions: new Set([MANAGE_ACCESS]) })),
    );
  });

  it('keeps a repository failure a defect (fail closed)', async () => {
    const fakes = makeIdentityFakes({ declarations });
    const failing = Layer.merge(
      fakes.layer,
      Layer.succeed(SessionRepository, {
        ...fakes.sessions,
        resolve: () => Effect.dieMessage('connection refused'),
      }),
    );
    const exit = await viaFacade(IdentityApiLive.pipe(Layer.provide(failing)), 'ann');
    expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true);
  });
});
